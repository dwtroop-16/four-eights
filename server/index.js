// server/index.js
// Custom Node.js + Next.js + Socket.io server for 4s and 8s.
//
// IMPORTANT DEPLOYMENT NOTE: Vercel's serverless functions do NOT support
// long-lived WebSocket connections. For production you have two options:
//   1) Deploy the Next.js frontend to Vercel, and deploy THIS server file
//      to Render, Railway, Fly.io, or any host that runs a persistent
//      Node process. Set NEXT_PUBLIC_SOCKET_URL in Vercel to point at it.
//   2) Run the whole thing on Render/Railway as one Node process (this
//      file serves both Next.js and Socket.io).
// See DEPLOY.md for the full walkthrough.

const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const {
  createRoom,
  addPlayer,
  removePlayer,
  startRound,
  setDecision,
  drawCards,
  viewForPlayer,
  PHASE,
} = require('../lib/game');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const nextHandler = app.getRequestHandler();

// In-memory room store. For production with multiple server instances,
// back this with Supabase or Redis. See lib/persistence.js.
const rooms = new Map(); // roomId -> room state
const socketToPlayer = new Map(); // socket.id -> { roomId, playerId }

function broadcastRoom(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  // Send each socket a player-specific view (hides other players' hands).
  for (const [socketId, ref] of socketToPlayer.entries()) {
    if (ref.roomId !== roomId) continue;
    const view = viewForPlayer(room, ref.playerId);
    io.to(socketId).emit('room:update', view);
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => nextHandler(req, res));
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    socket.on('room:create', ({ name }, ack) => {
      const roomId = randomUUID().slice(0, 6).toUpperCase();
      const playerId = randomUUID();
      const room = createRoom(roomId, playerId);
      addPlayer(room, playerId, name || 'Player');
      rooms.set(roomId, room);
      socketToPlayer.set(socket.id, { roomId, playerId });
      socket.join(roomId);
      ack && ack({ ok: true, roomId, playerId });
      broadcastRoom(io, roomId);
    });

    socket.on('room:join', ({ roomId, name }, ack) => {
      const room = rooms.get(roomId);
      if (!room) {
        ack && ack({ ok: false, error: 'Room not found.' });
        return;
      }
      const playerId = randomUUID();
      addPlayer(room, playerId, name || 'Player');
      socketToPlayer.set(socket.id, { roomId, playerId });
      socket.join(roomId);
      ack && ack({ ok: true, roomId, playerId });
      broadcastRoom(io, roomId);
    });

    socket.on('round:start', (_, ack) => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return ack && ack({ ok: false, error: 'Not in a room.' });
      const room = rooms.get(ref.roomId);
      if (!room) return ack && ack({ ok: false, error: 'Room missing.' });
      if (room.hostId !== ref.playerId) {
        return ack && ack({ ok: false, error: 'Only the host may start a round.' });
      }
      try {
        startRound(room);
        ack && ack({ ok: true });
        broadcastRoom(io, ref.roomId);
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
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('disconnect', () => {
      const ref = socketToPlayer.get(socket.id);
      if (!ref) return;
      const room = rooms.get(ref.roomId);
      if (room) {
        // If a round is in progress, mark the player OUT rather than yanking
        // them mid-hand. If WAITING, remove cleanly.
        if (room.phase === PHASE.WAITING) {
          removePlayer(room, ref.playerId);
        } else {
          const p = room.players.find((p) => p.id === ref.playerId);
          if (p && p.decision === 'PENDING') p.decision = 'OUT';
        }
        // Clean up empty rooms.
        if (room.players.length === 0) rooms.delete(ref.roomId);
        else broadcastRoom(io, ref.roomId);
      }
      socketToPlayer.delete(socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
