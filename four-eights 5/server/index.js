// server/index.js — v2 with timers, solo mode, avatars
const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const {
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
  PHASE,
  TURN_TIMEOUT_MS,
} = require('../lib/game');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const nextHandler = app.getRequestHandler();

const rooms = new Map();
const socketToPlayer = new Map();
const roomTimers = new Map(); // roomId -> setTimeout handle for active turn deadline

function broadcastRoom(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [socketId, ref] of socketToPlayer.entries()) {
    if (ref.roomId !== roomId) continue;
    io.to(socketId).emit('room:update', viewForPlayer(room, ref.playerId));
  }
}

// Schedule a server-side timeout that fires when the active turn deadline
// passes. Clears any previous timer for the room.
function scheduleTurnTimer(io, roomId) {
  const existing = roomTimers.get(roomId);
  if (existing) clearTimeout(existing);
  const room = rooms.get(roomId);
  if (!room || room.paused || !room.turnDeadline) {
    roomTimers.delete(roomId);
    return;
  }
  const ms = Math.max(0, room.turnDeadline - Date.now());
  const handle = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.paused) return;
    applyTimeout(r);
    broadcastRoom(io, roomId);
    if (r.turnDeadline) scheduleTurnTimer(io, roomId);
  }, ms + 50);
  roomTimers.set(roomId, handle);
}

function cleanupRoom(roomId) {
  const t = roomTimers.get(roomId);
  if (t) clearTimeout(t);
  roomTimers.delete(roomId);
  rooms.delete(roomId);
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => nextHandler(req, res));
  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.on('room:create', ({ name, avatar, mode }, ack) => {
      const safeMode = mode === 'solo' ? 'solo' : 'multi';
      const roomId = randomUUID().slice(0, 6).toUpperCase();
      const playerId = randomUUID();
      const room = createRoom(roomId, playerId, safeMode);
      try {
        addPlayer(room, playerId, name || 'Host', avatar);
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
      rooms.set(roomId, room);
      socketToPlayer.set(socket.id, { roomId, playerId });
      socket.join(roomId);
      ack && ack({ ok: true, roomId, playerId, mode: safeMode });
      broadcastRoom(io, roomId);
    });

    socket.on('room:join', ({ roomId, name, avatar }, ack) => {
      const room = rooms.get(roomId);
      if (!room) return ack && ack({ ok: false, error: 'Room not found.' });
      if (room.mode === 'solo') {
        return ack && ack({ ok: false, error: 'This is a solo practice room.' });
      }
      const playerId = randomUUID();
      try {
        addPlayer(room, playerId, name || 'Player', avatar);
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
      socketToPlayer.set(socket.id, { roomId, playerId });
      socket.join(roomId);
      ack && ack({ ok: true, roomId, playerId, mode: room.mode });
      broadcastRoom(io, roomId);
    });

    socket.on('player:avatar', ({ avatar }, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      try {
        setAvatar(room, ref.playerId, avatar);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('round:start', (_, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      if (room.hostId !== ref.playerId) {
        return ack && ack({ ok: false, error: 'Only the host may start a round.' });
      }
      try {
        startRound(room);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
        scheduleTurnTimer(io, ref.roomId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('player:decide', ({ decision }, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      try {
        setDecision(room, ref.playerId, decision);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
        scheduleTurnTimer(io, ref.roomId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('player:draw', ({ discardIds }, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      try {
        drawCards(room, ref.playerId, discardIds || []);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
        scheduleTurnTimer(io, ref.roomId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('room:pause', (_, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      try {
        pauseGame(room, ref.playerId);
        // Cancel pending timeout so it doesn't fire mid-pause.
        const t = roomTimers.get(ref.roomId);
        if (t) clearTimeout(t);
        roomTimers.delete(ref.roomId);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('room:resume', (_, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      try {
        resumeGame(room, ref.playerId);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
        scheduleTurnTimer(io, ref.roomId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('room:leave', (_, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      if (room) {
        leaveRoom(room, ref.playerId);
        if (room.players.length === 0) {
          cleanupRoom(ref.roomId);
        } else {
          broadcastRoom(io, ref.roomId);
          scheduleTurnTimer(io, ref.roomId);
        }
      }
      socketToPlayer.delete(socket.id);
      socket.leave(ref.roomId);
      ack && ack({ ok: true });
    });

    socket.on('disconnect', () => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (room) {
        disconnectPlayer(room, ref.playerId);
        if (room.players.length === 0) {
          cleanupRoom(ref.roomId);
        } else {
          broadcastRoom(io, ref.roomId);
          scheduleTurnTimer(io, ref.roomId);
        }
      }
      socketToPlayer.delete(socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
