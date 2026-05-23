// lib/game.js
// Game state model and round engine for 4s and 8s.
//
// Phase machine for a single round:
//   WAITING   -> waiting for players, no round in progress
//   ANTE      -> all players post ante; pot collected
//   DEAL      -> each player dealt 4 cards
//   DECISION  -> each player chooses IN or OUT
//   DRAW      -> in-players may discard and redraw
//   SHOWDOWN  -> hands compared; winner(s) determined
//   SETTLE    -> pot paid to winner; losses computed; rollover set up
//
// Pot rollover rule (the defining mechanic):
//   When losing IN-players each owe "the amount that was in the pot" into
//   the next round, the next round's starting pot grows. This is what
//   makes the game escalate.

const {
  buildDeck,
  shuffle,
  deal,
  discardAndRedraw,
} = require('./deck');
const {
  evaluateHand,
  evaluateBitch,
  findWinners,
  compare,
  CATEGORY_NAME,
} = require('./evaluator');

const PHASE = {
  WAITING: 'WAITING',
  ANTE: 'ANTE',
  DEAL: 'DEAL',
  DECISION: 'DECISION',
  DRAW: 'DRAW',
  SHOWDOWN: 'SHOWDOWN',
  SETTLE: 'SETTLE',
};

const DECISION = {
  PENDING: 'PENDING',
  IN: 'IN',
  OUT: 'OUT',
};

const ANTE = 1;

// Create a fresh room/table state.
function createRoom(roomId, hostId) {
  return {
    roomId,
    hostId,
    players: [], // { id, name, chips, decision, hand, isReady, hasDrawn }
    phase: PHASE.WAITING,
    pot: 0,
    rolloverOwed: {}, // playerId -> amount they owe at start of next round
    deck: [],
    bitchHand: null, // assigned only when exactly one player stays IN
    lastResult: null, // result of the last completed round, for display
    round: 0,
  };
}

function addPlayer(room, playerId, name, startingChips = 100) {
  if (room.players.find((p) => p.id === playerId)) return room;
  if (room.phase !== PHASE.WAITING) {
    // Allow joining as spectator-style; mark not ready
  }
  room.players.push({
    id: playerId,
    name,
    chips: startingChips,
    decision: DECISION.PENDING,
    hand: [],
    isReady: false,
    hasDrawn: false,
  });
  return room;
}

function removePlayer(room, playerId) {
  room.players = room.players.filter((p) => p.id !== playerId);
  delete room.rolloverOwed[playerId];
  return room;
}

// Begin a new round. Collects antes and any rollover owed from previous round.
function startRound(room) {
  if (room.players.length < 2) {
    throw new Error('Need at least 2 players to start a round.');
  }
  room.round += 1;
  room.phase = PHASE.ANTE;
  room.deck = shuffle(buildDeck());
  room.bitchHand = null;
  room.lastResult = null;

  // Collect antes + rollover from previous round.
  let pot = 0;
  for (const p of room.players) {
    const owed = room.rolloverOwed[p.id] || 0;
    const contribution = ANTE + owed;
    if (p.chips < contribution) {
      throw new Error(`Player ${p.name} cannot cover ante + rollover (${contribution}).`);
    }
    p.chips -= contribution;
    pot += contribution;
    p.decision = DECISION.PENDING;
    p.hand = [];
    p.hasDrawn = false;
  }
  room.rolloverOwed = {};
  room.pot = pot;

  // Deal 4 cards to each player.
  for (const p of room.players) {
    const [hand, rest] = deal(room.deck, 4);
    p.hand = hand;
    room.deck = rest;
  }
  room.phase = PHASE.DECISION;
  return room;
}

function setDecision(room, playerId, decision) {
  if (room.phase !== PHASE.DECISION) {
    throw new Error('Not in decision phase.');
  }
  const p = room.players.find((p) => p.id === playerId);
  if (!p) throw new Error('Player not in room.');
  if (decision !== DECISION.IN && decision !== DECISION.OUT) {
    throw new Error('Invalid decision.');
  }
  p.decision = decision;
  // If everyone has decided, advance.
  if (room.players.every((p) => p.decision !== DECISION.PENDING)) {
    advanceToDrawOrShowdown(room);
  }
  return room;
}

function advanceToDrawOrShowdown(room) {
  const insiders = room.players.filter((p) => p.decision === DECISION.IN);
  if (insiders.length === 0) {
    // Nobody played. Pot stays for next round as a carryover. No rollover
    // is owed because nobody stayed in to lose.
    room.phase = PHASE.SETTLE;
    room.lastResult = {
      type: 'NO_PLAYERS',
      message: 'Nobody stayed in. Pot carries to next round.',
      potCarry: room.pot,
    };
    // Carry the pot by adding it to nobody's rollover but keeping it as
    // a "house" carry: we model this by leaving room.pot and adding it
    // to the next ante via a special carry field on the room.
    room.carryPot = (room.carryPot || 0) + room.pot;
    room.pot = 0;
    return room;
  }
  room.phase = PHASE.DRAW;
  return room;
}

// Player discards 0+ cards by ID and draws replacements. Each player may
// only draw once per round.
function drawCards(room, playerId, discardIds) {
  if (room.phase !== PHASE.DRAW) {
    throw new Error('Not in draw phase.');
  }
  const p = room.players.find((p) => p.id === playerId);
  if (!p) throw new Error('Player not in room.');
  if (p.decision !== DECISION.IN) {
    throw new Error('Only IN players may draw.');
  }
  if (p.hasDrawn) {
    throw new Error('Player has already drawn this round.');
  }
  const [newHand, rest] = discardAndRedraw(p.hand, discardIds, room.deck);
  p.hand = newHand;
  room.deck = rest;
  p.hasDrawn = true;
  // If all in-players have drawn, advance to showdown.
  const insiders = room.players.filter((pl) => pl.decision === DECISION.IN);
  if (insiders.every((pl) => pl.hasDrawn)) {
    runShowdown(room);
  }
  return room;
}

// Compute showdown. Handles the solo-vs-Bitch case.
function runShowdown(room) {
  room.phase = PHASE.SHOWDOWN;
  const insiders = room.players.filter((p) => p.decision === DECISION.IN);

  let entries; // { playerId, evaluation, isBitch? }
  if (insiders.length === 1) {
    // Solo IN-player vs The Bitch (top 5 cards of remaining deck).
    const [bitchCards, rest] = deal(room.deck, 5);
    room.deck = rest;
    room.bitchHand = bitchCards;
    const soloEval = evaluateHand(insiders[0].hand);
    const bitchEval = evaluateBitch(bitchCards);
    entries = [
      { playerId: insiders[0].id, evaluation: soloEval },
      { playerId: '__BITCH__', evaluation: bitchEval, isBitch: true },
    ];
  } else {
    entries = insiders.map((p) => ({
      playerId: p.id,
      evaluation: evaluateHand(p.hand),
    }));
  }

  let { winnerIds, needsTiebreak } = findWinners(entries);

  // Resolve ties by drawing top card off the deck for each tied entry,
  // higher card wins. Repeat as needed.
  const tiebreakDraws = [];
  while (needsTiebreak) {
    const draws = winnerIds.map((id) => {
      const [card] = deal(room.deck, 1);
      room.deck = room.deck.slice(1);
      return { playerId: id, card: card[0] };
    });
    tiebreakDraws.push(draws);
    // Highest rank wins; if tied again, loop.
    const max = Math.max(...draws.map((d) => require('./deck').RANK_VALUE[d.card.rank]));
    const newWinners = draws
      .filter((d) => require('./deck').RANK_VALUE[d.card.rank] === max)
      .map((d) => d.playerId);
    if (newWinners.length === winnerIds.length) {
      // Same number of ties - keep going.
      winnerIds = newWinners;
      needsTiebreak = newWinners.length > 1;
    } else {
      winnerIds = newWinners;
      needsTiebreak = newWinners.length > 1;
    }
  }

  settle(room, entries, winnerIds, tiebreakDraws);
  return room;
}

// Pay pot to winner, compute rollover for losing IN-players.
function settle(room, entries, winnerIds, tiebreakDraws) {
  room.phase = PHASE.SETTLE;
  const potAmount = room.pot;
  const insiders = room.players.filter((p) => p.decision === DECISION.IN);

  const winnerIsBitch = winnerIds.length === 1 && winnerIds[0] === '__BITCH__';

  if (winnerIsBitch) {
    // The Bitch wins. Pot is held by the house (carries to next round).
    // The solo IN-player owes the pot amount as rollover.
    const loser = insiders[0];
    room.rolloverOwed[loser.id] = potAmount;
    room.carryPot = (room.carryPot || 0) + potAmount;
    room.pot = 0;
  } else {
    // Distribute pot equally among human winners (usually just one).
    const humanWinners = winnerIds.filter((id) => id !== '__BITCH__');
    const share = Math.floor(potAmount / humanWinners.length);
    const remainder = potAmount - share * humanWinners.length;
    humanWinners.forEach((id, i) => {
      const w = room.players.find((p) => p.id === id);
      w.chips += share + (i === 0 ? remainder : 0);
    });
    room.pot = 0;

    // Losing IN-players each owe the pot amount into the next round.
    for (const p of insiders) {
      if (!winnerIds.includes(p.id)) {
        room.rolloverOwed[p.id] = potAmount;
      }
    }
  }

  room.lastResult = {
    type: winnerIsBitch ? 'BITCH_WINS' : 'PLAYER_WINS',
    winnerIds: winnerIds.filter((id) => id !== '__BITCH__'),
    winnerIsBitch,
    bitchHand: room.bitchHand,
    evaluations: entries.map((e) => ({
      playerId: e.playerId,
      category: e.evaluation.category,
      categoryName: CATEGORY_NAME[e.evaluation.category],
      primaryRank: e.evaluation.primaryRank,
    })),
    tiebreakDraws,
    potAmount,
    rolloverOwed: { ...room.rolloverOwed },
  };
}

// Get a view of the room sanitized for a particular player: hides
// other players' hole cards.
function viewForPlayer(room, playerId) {
  return {
    ...room,
    deck: { remaining: room.deck.length }, // never expose the deck
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      decision: p.decision,
      hasDrawn: p.hasDrawn,
      hand:
        p.id === playerId || room.phase === PHASE.SHOWDOWN || room.phase === PHASE.SETTLE
          ? p.hand
          : p.hand.map(() => ({ hidden: true })),
    })),
    bitchHand:
      room.phase === PHASE.SHOWDOWN || room.phase === PHASE.SETTLE ? room.bitchHand : null,
  };
}

module.exports = {
  PHASE,
  DECISION,
  ANTE,
  createRoom,
  addPlayer,
  removePlayer,
  startRound,
  setDecision,
  drawCards,
  runShowdown,
  viewForPlayer,
};
