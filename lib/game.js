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
const BUY_IN_AMOUNT = 20;
const MAX_PLAYERS = 10;
const TURN_TIMEOUT_MS = 30_000;

function createRoom(roomId, hostId, mode = 'multi') {
  return {
    roomId,
    hostId,
    mode,
    players: [],
    phase: PHASE.WAITING,
    pot: 0,
    carryPot: 0,
    rolloverOwed: {},
    deck: [],
    paused: false,
    pausedRemainingMs: null,
    lockedToNewJoiners: false,
    ledger: {},
    potContributions: {},
    bitchHand: null,
    lastResult: null,
    round: 0,
    dealerIndex: 0,
    activePlayerId: null,
    turnDeadline: null,
    seatOrder: [],
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
    startingChips,
    buyIns: 0,
    freeCredits: 0,
    decision: DECISION.PENDING,
    hand: [],
    hasDrawn: false,
    discardCount: null,
    connected: true,
  };
  room.players.push(player);
  room.seatOrder.push(playerId);
  return room;
}

function disconnectPlayer(room, playerId) {
  const p = room.players.find((p) => p.id === playerId);
  if (!p) return room;
  p.connected = false;
  if (room.phase === PHASE.WAITING) {
    room.players = room.players.filter((pp) => pp.id !== playerId);
    room.seatOrder = room.seatOrder.filter((id) => id !== playerId);
    delete room.rolloverOwed[playerId];
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }
    return room;
  }
  if (p.decision === DECISION.PENDING) p.decision = DECISION.OUT;
  if (room.phase === PHASE.DECISION && room.activePlayerId === playerId) {
    advanceTurn(room);
  } else if (room.phase === PHASE.DRAW && room.activePlayerId === playerId) {
    p.hasDrawn = true;
    p.discardCount = 0;
    advanceTurn(room);
  }
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
  if (room.round > 1) {
    room.dealerIndex = (room.dealerIndex + 1) % room.seatOrder.length;
  }
  let pot = room.carryPot || 0;
  room.carryPot = 0;
  room.potContributions = {};
  room.buyInsThisRound = {};
  room.freeAntesUsedThisRound = {};
  for (const p of room.players) {
    if (!p.connected) continue;
    const owed = room.rolloverOwed[p.id] || 0;
    let anteDue = ANTE;
    if (anteDue > 0 && (p.freeCredits || 0) > 0) {
      p.freeCredits -= 1;
      room.freeAntesUsedThisRound[p.id] = (room.freeAntesUsedThisRound[p.id] || 0) + ANTE;
      anteDue = 0;
    }
    const contribution = anteDue + owed;
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
  for (const id of computeActOrder(room)) {
    const p = room.players.find((pp) => pp.id === id);
    if (!p || !p.connected || p.decision === DECISION.OUT) continue;
    const [hand, rest] = deal(room.deck, 4);
    p.hand = hand;
    room.deck = rest;
  }
  room.phase = PHASE.DECISION;
  beginNextTurn(room);
  return room;
}

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

function advanceTurn(room) {
  room.activePlayerId = null;
  room.turnDeadline = null;
  beginNextTurn(room);
}
