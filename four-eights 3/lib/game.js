// lib/game.js
// 4s and 8s game engine — v2.
//
// Changes from v1:
//   - Room size: 1 (solo practice) or 2-10 players (multiplayer)
//   - Turn-based decisions and draws (rotates each round)
//   - 30s timer per turn, defaults to OUT on timeout
//   - Solo mode: 1 player vs The Bitch every round
//   - Multi mode with one IN-player: still faces The Bitch
//   - Dealer rotates left each round; affects acting order
//   - Players leaving mid-game don't stall the round

const { buildDeck, shuffle, deal, discardAndRedraw, RANK_VALUE } = require('./deck');
const {
  evaluateHand,
  evaluateBitch,
  findWinners,
  CATEGORY_NAME,
} = require('./evaluator');
const { defaultAvatar, validateAvatar } = require('./avatars');

const PHASE = {
  WAITING: 'WAITING',
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
const BUY_IN_AMOUNT = 20; // auto-granted when a player can't cover their obligations
const MAX_PLAYERS = 10;
const TURN_TIMEOUT_MS = 30_000;

function createRoom(roomId, hostId, mode = 'multi') {
  return {
    roomId,
    hostId,
    mode, // 'solo' | 'multi'
    players: [],
    phase: PHASE.WAITING,
    pot: 0,
    carryPot: 0,
    rolloverOwed: {},
    deck: [],
    paused: false,
    pausedRemainingMs: null,
    // When true, no new players may join. Set when the Bitch wins a hand;
    // cleared when a player beats the Bitch.
    lockedToNewJoiners: false, // saved time-left when paused mid-turn
    // ledger[winnerId][loserId] = total chips winnerId has won from loserId
    // The Bitch is represented as the pseudo-player id '__BITCH__'.
    // ledger is symmetric in storage: we update both ledger[A][B] and ledger[B][A]
    // (B's losses to A are A's wins from B; we only store the positive direction).
    ledger: {},
    // potContributions[playerId] = chips that player has put into the current pot
    // Reset to {} at the start of every round, accumulated during startRound.
    potContributions: {},
    bitchHand: null,
    lastResult: null,
    round: 0,
    dealerIndex: 0, // rotates left each round; index into seat order at round start
    activePlayerId: null, // whose turn it is during DECISION/DRAW
    turnDeadline: null, // epoch ms; null when no timer is active
    seatOrder: [], // player IDs in clockwise seat order; fixed once set, players appended at end
  };
}

function addPlayer(room, playerId, name, avatar, startingChips = 100) {
  if (room.players.find((p) => p.id === playerId)) return room;
  if (room.lockedToNewJoiners) {
    throw new Error('This room is locked. Someone must beat The Bitch before new players can join.');
  }
  const isMulti = room.mode === 'multi';
  const cap = isMulti ? MAX_PLAYERS : 1;
  if (room.players.length >= cap) {
    throw new Error(
      isMulti ? `Room is full (max ${MAX_PLAYERS}).` : 'Solo room is for one player only.',
    );
  }
  const seatIndex = room.players.length;
  const player = {
    id: playerId,
    name: name || `Player ${seatIndex + 1}`,
    avatar: validateAvatar(avatar) || defaultAvatar(seatIndex),
    chips: startingChips,
    startingChips, // frozen at join time so chip-delta math is stable
    buyIns: 0, // total extra chips granted from auto buy-ins
    freeCredits: 0, // ante-free rounds earned when in the room during a Bitch win
    decision: DECISION.PENDING,
    hand: [],
    hasDrawn: false,
    discardCount: null, // null = hasn't drawn yet; 0 = stood pat; >0 = swapped that many
    connected: true,
  };
  room.players.push(player);
  room.seatOrder.push(playerId);
  return room;
}

// Marks a player disconnected. They stay in seatOrder so dealer rotation
// remains stable, but auto-fold and advance if it's their turn.
function disconnectPlayer(room, playerId) {
  const p = room.players.find((p) => p.id === playerId);
  if (!p) return room;
  p.connected = false;
  if (room.phase === PHASE.WAITING) {
    // Clean removal pre-round
    room.players = room.players.filter((pp) => pp.id !== playerId);
    room.seatOrder = room.seatOrder.filter((id) => id !== playerId);
    delete room.rolloverOwed[playerId];
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }
    return room;
  }
  // Mid-round: auto-fold and advance if needed
  if (p.decision === DECISION.PENDING) p.decision = DECISION.OUT;
  if (room.phase === PHASE.DECISION && room.activePlayerId === playerId) {
    advanceTurn(room);
  } else if (room.phase === PHASE.DRAW && room.activePlayerId === playerId) {
    // They left without drawing; treat as "stand pat" (no discards)
    p.hasDrawn = true;
    p.discardCount = 0;
    advanceTurn(room);
  }
  // Host transfer if the host left
  if (room.hostId === playerId) {
    const nextHost = room.players.find((pp) => pp.connected && pp.id !== playerId);
    if (nextHost) room.hostId = nextHost.id;
  }
  return room;
}

function setAvatar(room, playerId, avatar) {
  const p = room.players.find((pp) => pp.id === playerId);
  if (!p) throw new Error('Player not in room.');
  const valid = validateAvatar(avatar);
  if (!valid) throw new Error('Invalid avatar.');
  p.avatar = valid;
  return room;
}

// Compute the order players act in this round, starting left of the dealer.
// In a 5-player room with dealerIndex=2, order is seats [3,4,0,1,2].
function computeActOrder(room) {
  const n = room.seatOrder.length;
  if (n === 0) return [];
  const order = [];
  for (let i = 1; i <= n; i++) {
    order.push(room.seatOrder[(room.dealerIndex + i) % n]);
  }
  return order;
}

function startRound(room) {
  if (room.paused) throw new Error('Game is paused.');
  const connected = room.players.filter((p) => p.connected);
  if (room.mode === 'multi' && connected.length < 2) {
    throw new Error('Need at least 2 players to start a multiplayer round.');
  }
  if (room.mode === 'solo' && connected.length !== 1) {
    throw new Error('Solo mode requires exactly one player.');
  }

  room.round += 1;
  room.deck = shuffle(buildDeck());
  room.bitchHand = null;
  room.lastResult = null;

  // Rotate dealer left for rounds after the first
  if (room.round > 1) {
    room.dealerIndex = (room.dealerIndex + 1) % room.seatOrder.length;
  }

  // Collect antes + any rollover debt
  let pot = room.carryPot || 0;
  room.carryPot = 0;
  // Reset contributions tracker for this round. Any carryPot is "from previous
  // losers" — we credit it to the players who originally lost it. We do this
  // by *not* zeroing the carryover attribution: when a player owes rollover,
  // their contribution this round includes that rollover, and the carryPot
  // portion was already attributed in the round it was originally collected.
  room.potContributions = {};
  // buyInsThisRound tracks who got a buy-in during this round's ante collection,
  // for the result message so players see what happened.
  room.buyInsThisRound = {};
  // freeAntesUsedThisRound tracks who spent a free credit, for the result message.
  room.freeAntesUsedThisRound = {};
  for (const p of room.players) {
    if (!p.connected) continue;
    const owed = room.rolloverOwed[p.id] || 0;
    // Free credit waives the $1 ante but NOT rollover debt.
    let anteDue = ANTE;
    if (anteDue > 0 && (p.freeCredits || 0) > 0) {
      p.freeCredits -= 1;
      room.freeAntesUsedThisRound[p.id] = (room.freeAntesUsedThisRound[p.id] || 0) + ANTE;
      anteDue = 0;
    }
    let contribution = anteDue + owed;
    // Auto buy-in when the player can't cover their obligation.
    while (p.chips < contribution) {
      p.chips += BUY_IN_AMOUNT;
      p.buyIns += BUY_IN_AMOUNT;
      room.buyInsThisRound[p.id] = (room.buyInsThisRound[p.id] || 0) + BUY_IN_AMOUNT;
    }
    p.chips -= contribution;
    pot += contribution;
    if (contribution > 0) {
      room.potContributions[p.id] = (room.potContributions[p.id] || 0) + contribution;
    }
    p.decision = DECISION.PENDING;
    p.hand = [];
    p.hasDrawn = false;
    p.discardCount = null;
  }
  room.rolloverOwed = {};
  room.pot = pot;

  // Deal 4 cards to each non-folded connected player
  for (const id of computeActOrder(room)) {
    const p = room.players.find((pp) => pp.id === id);
    if (!p || !p.connected || p.decision === DECISION.OUT) continue;
    const [hand, rest] = deal(room.deck, 4);
    p.hand = hand;
    room.deck = rest;
  }

  room.phase = PHASE.DECISION;
  // First to act: first player in act order who is still pending
  beginNextTurn(room);
  return room;
}

// Pick the next player who needs to act in the current phase, set turn timer.
function beginNextTurn(room) {
  const order = computeActOrder(room);
  let candidate = null;

  if (room.phase === PHASE.DECISION) {
    candidate = order.find((id) => {
      const p = room.players.find((pp) => pp.id === id);
      return p && p.connected && p.decision === DECISION.PENDING;
    });
  } else if (room.phase === PHASE.DRAW) {
    candidate = order.find((id) => {
      const p = room.players.find((pp) => pp.id === id);
      return p && p.connected && p.decision === DECISION.IN && !p.hasDrawn;
    });
  }

  if (!candidate) {
    // Phase is complete — advance.
    if (room.phase === PHASE.DECISION) {
      transitionAfterDecisions(room);
    } else if (room.phase === PHASE.DRAW) {
      runShowdown(room);
    }
    return;
  }

  room.activePlayerId = candidate;
  room.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
}

// Move on after the current active player has acted.
function advanceTurn(room) {
  room.activePlayerId = null;
  room.turnDeadline = null;
  beginNextTurn(room);
}

function transitionAfterDecisions(room) {
  const insiders = room.players.filter((p) => p.connected && p.decision === DECISION.IN);
  if (insiders.length === 0) {
    // Nobody played. Carry the pot. Every folder earns a free-ante credit.
    room.phase = PHASE.SETTLE;
    room.activePlayerId = null;
    room.turnDeadline = null;
    room.carryPot = (room.carryPot || 0) + room.pot;
    const freeAntesGranted = {};
    for (const p of room.players) {
      if (p.decision === DECISION.OUT) {
        p.freeCredits = (p.freeCredits || 0) + 1;
        freeAntesGranted[p.id] = 1;
      }
    }
    room.lastResult = {
      type: 'NO_PLAYERS',
      message: 'Nobody stayed in. Pot carries to next round.',
      potAmount: room.pot,
      rolloverOwed: {},
      evaluations: [],
      buyInsThisRound: { ...(room.buyInsThisRound || {}) },
      freeAntesUsedThisRound: { ...(room.freeAntesUsedThisRound || {}) },
      freeCreditsGranted: freeAntesGranted,
    };
    room.buyInsThisRound = {};
    room.freeAntesUsedThisRound = {};
    room.pot = 0;
    return;
  }
  room.phase = PHASE.DRAW;
  beginNextTurn(room);
}

function setDecision(room, playerId, decision) {
  if (room.paused) throw new Error('Game is paused.');
  if (room.phase !== PHASE.DECISION) throw new Error('Not in decision phase.');
  if (room.activePlayerId !== playerId) throw new Error('Not your turn to decide.');
  if (decision !== DECISION.IN && decision !== DECISION.OUT) {
    throw new Error('Invalid decision.');
  }
  const p = room.players.find((pp) => pp.id === playerId);
  p.decision = decision;
  advanceTurn(room);
  return room;
}

function drawCards(room, playerId, discardIds) {
  if (room.paused) throw new Error('Game is paused.');
  if (room.phase !== PHASE.DRAW) throw new Error('Not in draw phase.');
  if (room.activePlayerId !== playerId) throw new Error('Not your turn to draw.');
  const p = room.players.find((pp) => pp.id === playerId);
  if (!p) throw new Error('Player not in room.');
  if (p.decision !== DECISION.IN) throw new Error('Only IN players may draw.');
  if (p.hasDrawn) throw new Error('Already drew this round.');
  const ids = discardIds || [];
  const [newHand, rest] = discardAndRedraw(p.hand, ids, room.deck);
  p.hand = newHand;
  room.deck = rest;
  p.hasDrawn = true;
  p.discardCount = ids.length;
  advanceTurn(room);
  return room;
}

// Called by server timer enforcement when a deadline passes.
function applyTimeout(room) {
  if (!room.activePlayerId || !room.turnDeadline) return room;
  if (Date.now() < room.turnDeadline) return room;
  const playerId = room.activePlayerId;
  const p = room.players.find((pp) => pp.id === playerId);
  if (!p) {
    room.activePlayerId = null;
    room.turnDeadline = null;
    return room;
  }
  if (room.phase === PHASE.DECISION) {
    // Timeout defaults to OUT (safest — preserves chips)
    p.decision = DECISION.OUT;
  } else if (room.phase === PHASE.DRAW) {
    // Timeout = stand pat (no discards)
    p.hasDrawn = true;
    p.discardCount = 0;
  }
  advanceTurn(room);
  return room;
}

function runShowdown(room) {
  room.phase = PHASE.SHOWDOWN;
  room.activePlayerId = null;
  room.turnDeadline = null;

  const insiders = room.players.filter((p) => p.connected && p.decision === DECISION.IN);
  let entries;

  // Solo mode OR multi-mode-with-one-IN-player both face The Bitch
  if (insiders.length === 1) {
    const [bitchCards, rest] = deal(room.deck, 5);
    room.deck = rest;
    room.bitchHand = bitchCards;
    entries = [
      { playerId: insiders[0].id, evaluation: evaluateHand(insiders[0].hand) },
      { playerId: '__BITCH__', evaluation: evaluateBitch(bitchCards), isBitch: true },
    ];
  } else {
    entries = insiders.map((p) => ({
      playerId: p.id,
      evaluation: evaluateHand(p.hand),
    }));
  }

  let { winnerIds, needsTiebreak } = findWinners(entries);
  const tiebreakDraws = [];
  while (needsTiebreak) {
    const draws = winnerIds.map((id) => {
      const card = room.deck[0];
      room.deck = room.deck.slice(1);
      return { playerId: id, card };
    });
    tiebreakDraws.push(draws);
    const max = Math.max(...draws.map((d) => RANK_VALUE[d.card.rank]));
    const next = draws.filter((d) => RANK_VALUE[d.card.rank] === max).map((d) => d.playerId);
    winnerIds = next;
    needsTiebreak = next.length > 1;
  }

  settle(room, entries, winnerIds, tiebreakDraws);
  return room;
}

// Record `amount` chips won by `winnerId` from `loserId` in the ledger.
// Both ids may be a real player id or '__BITCH__'.
function addLedgerEntry(room, winnerId, loserId, amount) {
  if (!winnerId || !loserId || winnerId === loserId || amount <= 0) return;
  if (!room.ledger[winnerId]) room.ledger[winnerId] = {};
  room.ledger[winnerId][loserId] = (room.ledger[winnerId][loserId] || 0) + amount;
}

function settle(room, entries, winnerIds, tiebreakDraws) {
  room.phase = PHASE.SETTLE;
  const potAmount = room.pot;
  const carryBefore = room.carryPot || 0;
  const insiders = room.players.filter((p) => p.connected && p.decision === DECISION.IN);
  const winnerIsBitch = winnerIds.length === 1 && winnerIds[0] === '__BITCH__';
  const bitchWasInPlay = entries.some((e) => e.playerId === '__BITCH__');
  const playerBeatBitch = bitchWasInPlay && !winnerIsBitch;

  // Snapshot of who paid what into this pot, used for ledger attribution.
  const contributions = { ...room.potContributions };

  if (winnerIsBitch) {
    // Bitch wins: the lone IN-player replaces the pot amount immediately by
    // paying it out of their chip stack. The original pot AND the replacement
    // both carry into the next round, so if pot was $3, next round starts
    // with $6 sitting in it. Folders (players who chose OUT) earn a free-play
    // credit for the next round. Credits stack across consecutive
    // Bitch wins.
    const loser = insiders[0];
    if (loser) {
      // Trigger buy-in if they can't afford to replace the pot
      while (loser.chips < potAmount) {
        loser.chips += BUY_IN_AMOUNT;
        loser.buyIns += BUY_IN_AMOUNT;
        room.buyInsThisRound = room.buyInsThisRound || {};
        room.buyInsThisRound[loser.id] = (room.buyInsThisRound[loser.id] || 0) + BUY_IN_AMOUNT;
      }
      loser.chips -= potAmount;
    }
    // Both the original pot and the replacement carry to next round.
    room.carryPot = (room.carryPot || 0) + potAmount * 2;
    room.pot = 0;

    // Grant a free-play credit to every folder (players who chose OUT).
    for (const p of room.players) {
      if (p.decision === DECISION.OUT) {
        p.freeCredits = (p.freeCredits || 0) + 1;
      }
    }

    // Lock the room to new joiners until a player beats the Bitch.
    room.lockedToNewJoiners = true;
  } else {
    const humanWinners = winnerIds.filter((id) => id !== '__BITCH__');
    const share = Math.floor(potAmount / humanWinners.length);
    const remainder = potAmount - share * humanWinners.length;
    humanWinners.forEach((id, i) => {
      const w = room.players.find((p) => p.id === id);
      if (w) w.chips += share + (i === 0 ? remainder : 0);
    });
    room.pot = 0;

    if (playerBeatBitch) {
      // FRESH-START RULE: when a human beats the Bitch, the game resets cleanly.
      // No rollover debts carry, the carryPot is wiped.
      // Everyone who wants to play the next round antes 1 fresh.
      // Also unlocks the room to new joiners.
      // Folders still earn a free-play credit for their fold.
      room.rolloverOwed = {};
      room.carryPot = 0;
      room.lockedToNewJoiners = false;

      for (const p of room.players) {
        if (p.decision === DECISION.OUT) {
          p.freeCredits = (p.freeCredits || 0) + 1;
        }
      }

      // Ledger: the human winner wins each contributor's contribution.
      const winnerId = humanWinners[0];
      for (const [playerId, amount] of Object.entries(contributions)) {
        if (playerId === winnerId) continue;
        addLedgerEntry(room, winnerId, playerId, amount);
      }
    } else {
      // Normal multi-player showdown (no Bitch): each losing IN-player must
      // replace the pot amount immediately out of their chip stack.
      // Replacement chips carry to next round.
      // Folders earn a free-play credit for the next round.
      let replacementCarry = 0;
      for (const p of insiders) {
        if (winnerIds.includes(p.id)) continue;
        // This losing IN-player must pay `potAmount` right now.
        while (p.chips < potAmount) {
          p.chips += BUY_IN_AMOUNT;
          p.buyIns += BUY_IN_AMOUNT;
          room.buyInsThisRound = room.buyInsThisRound || {};
          room.buyInsThisRound[p.id] = (room.buyInsThisRound[p.id] || 0) + BUY_IN_AMOUNT;
        }
        p.chips -= potAmount;
        replacementCarry += potAmount;
      }
      room.carryPot = (room.carryPot || 0) + replacementCarry;
      // No rollover debts — payments are immediate.
      room.rolloverOwed = {};

      // Folders earn a free-play credit.
      for (const p of room.players) {
        if (p.decision === DECISION.OUT) {
          p.freeCredits = (p.freeCredits || 0) + 1;
        }
      }

      // Ledger: attribute contributions to the winner(s).
      const winnerCount = humanWinners.length;
      for (const [playerId, amount] of Object.entries(contributions)) {
        if (humanWinners.includes(playerId)) continue;
        const perWinner = Math.floor(amount / winnerCount);
        const remainderC = amount - perWinner * winnerCount;
        humanWinners.forEach((wid, i) => {
          const credit = perWinner + (i === 0 ? remainderC : 0);
          if (credit > 0) addLedgerEntry(room, wid, playerId, credit);
        });
      }
    }
  }

  // Clear the per-round contributions snapshot (we've consumed it for ledger updates)
  room.potContributions = {};

  // Snapshot which folders got credits this round (for the result message)
  const freeCreditsGranted = {};
  for (const p of room.players) {
    if (p.decision === DECISION.OUT) {
      freeCreditsGranted[p.id] = 1;
    }
  }

  room.lastResult = {
    type: winnerIsBitch ? 'BITCH_WINS' : (playerBeatBitch ? 'PLAYER_BEAT_BITCH' : 'PLAYER_WINS'),
    winnerIds: winnerIds.filter((id) => id !== '__BITCH__'),
    winnerIsBitch,
    playerBeatBitch,
    freshStart: playerBeatBitch,
    bitchHand: room.bitchHand,
    freeCreditsGranted,
    evaluations: entries.map((e) => ({
      playerId: e.playerId,
      category: e.evaluation.category,
      categoryName: CATEGORY_NAME[e.evaluation.category],
      primaryRank: e.evaluation.primaryRank,
    })),
    tiebreakDraws,
    potAmount,
    carryClearedAmount: playerBeatBitch ? carryBefore : 0,
    rolloverOwed: { ...room.rolloverOwed },
    buyInsThisRound: { ...(room.buyInsThisRound || {}) },
    freeAntesUsedThisRound: { ...(room.freeAntesUsedThisRound || {}) },
  };
  // Consumed — next round will populate fresh
  room.buyInsThisRound = {};
  room.freeAntesUsedThisRound = {};
}

function viewForPlayer(room, playerId) {
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    mode: room.mode,
    phase: room.phase,
    paused: !!room.paused,
    pot: room.pot,
    carryPot: room.carryPot || 0,
    lockedToNewJoiners: !!room.lockedToNewJoiners,
    round: room.round,
    dealerIndex: room.dealerIndex,
    activePlayerId: room.activePlayerId,
    turnDeadline: room.turnDeadline,
    seatOrder: room.seatOrder,
    deck: { remaining: room.deck.length },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      chips: p.chips,
      startingChips: p.startingChips ?? 100,
      buyIns: p.buyIns ?? 0,
      freeCredits: p.freeCredits ?? 0,
      decision: p.decision,
      hasDrawn: p.hasDrawn,
      discardCount: p.discardCount,
      connected: p.connected,
      hand:
        p.id === playerId || room.phase === PHASE.SHOWDOWN || room.phase === PHASE.SETTLE
          ? p.hand
          : p.hand.map(() => ({ hidden: true })),
    })),
    bitchHand:
      room.phase === PHASE.SHOWDOWN || room.phase === PHASE.SETTLE ? room.bitchHand : null,
    lastResult: room.lastResult,
    // Full ledger of who has won what from whom. Includes '__BITCH__' as a
    // pseudo-player on both sides. ledger[A][B] = chips A has won from B.
    ledger: room.ledger || {},
  };
}

// Pause the game. Only the host may pause. Freezes the turn deadline so the
// time-remaining when resumed equals what was left at pause time.
function pauseGame(room, requesterId) {
  if (room.hostId !== requesterId) throw new Error('Only the host may pause.');
  if (room.paused) return room;
  if (room.phase === PHASE.WAITING) throw new Error('Nothing to pause yet.');
  room.paused = true;
  if (room.turnDeadline) {
    room.pausedRemainingMs = Math.max(0, room.turnDeadline - Date.now());
    room.turnDeadline = null;
  } else {
    room.pausedRemainingMs = null;
  }
  return room;
}

// Resume the game with the same time remaining the active player had at pause.
function resumeGame(room, requesterId) {
  if (room.hostId !== requesterId) throw new Error('Only the host may resume.');
  if (!room.paused) return room;
  room.paused = false;
  if (room.activePlayerId && room.pausedRemainingMs != null) {
    room.turnDeadline = Date.now() + room.pausedRemainingMs;
  } else if (!room.activePlayerId && (room.phase === PHASE.DECISION || room.phase === PHASE.DRAW)) {
    // Active player left while paused — find the next one.
    beginNextTurn(room);
  }
  room.pausedRemainingMs = null;
  return room;
}

// Voluntary leave (different from disconnect — player is choosing to leave).
// If mid-round and they're IN, their ante stays in the pot (forfeited).
// If they were the host, host transfers to the next connected player.
function leaveRoom(room, playerId) {
  const p = room.players.find((pp) => pp.id === playerId);
  if (!p) return room;
  // If they were active, advance the turn so the game doesn't stall.
  const wasActive = room.activePlayerId === playerId;
  // Remove the player entirely.
  room.players = room.players.filter((pp) => pp.id !== playerId);
  room.seatOrder = room.seatOrder.filter((id) => id !== playerId);
  delete room.rolloverOwed[playerId];
  // Adjust dealerIndex if needed so it still points at a valid seat.
  if (room.seatOrder.length === 0) {
    room.dealerIndex = 0;
  } else if (room.dealerIndex >= room.seatOrder.length) {
    room.dealerIndex = 0;
  }
  // Host transfer.
  if (room.hostId === playerId) {
    const nextHost = room.players.find((pp) => pp.connected);
    room.hostId = nextHost ? nextHost.id : null;
  }
  // Advance the turn if they were active mid-round.
  if (wasActive && !room.paused) {
    room.activePlayerId = null;
    room.turnDeadline = null;
    if (room.phase === PHASE.DECISION || room.phase === PHASE.DRAW) {
      beginNextTurn(room);
    }
  } else if (wasActive && room.paused) {
    // While paused, just clear the active pointer; resume will advance.
    room.activePlayerId = null;
    room.pausedRemainingMs = null;
  }
  return room;
}

module.exports = {
  PHASE,
  DECISION,
  ANTE,
  MAX_PLAYERS,
  TURN_TIMEOUT_MS,
  createRoom,
  addPlayer,
  disconnectPlayer,
  setAvatar,
  startRound,
  setDecision,
  drawCards,
  applyTimeout,
  pauseGame,
  resumeGame,
  leaveRoom,
  viewForPlayer,
};


