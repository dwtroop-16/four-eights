// lib/persistence.js
// Optional Supabase persistence for completed rounds and chip leaderboards.
// Game state itself lives in memory on the Socket.io server for low latency;
// we only persist outcomes after each round.
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (server-side only; never expose to client)
//
// Suggested schema (run in Supabase SQL editor):
//
//   create table rooms (
//     room_id text primary key,
//     host_id text not null,
//     created_at timestamptz default now()
//   );
//
//   create table rounds (
//     id bigserial primary key,
//     room_id text references rooms(room_id),
//     round_number int not null,
//     pot_amount int not null,
//     winner_ids text[] not null,
//     winner_is_bitch bool not null,
//     evaluations jsonb not null,
//     bitch_hand jsonb,
//     created_at timestamptz default now()
//   );
//
//   create table player_chips (
//     room_id text,
//     player_id text,
//     name text,
//     chips int not null,
//     updated_at timestamptz default now(),
//     primary key (room_id, player_id)
//   );

const { createClient } = require('@supabase/supabase-js');

let _client = null;
function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // persistence disabled
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

async function recordRoomCreated(room) {
  const sb = getClient();
  if (!sb) return;
  await sb.from('rooms').upsert({ room_id: room.roomId, host_id: room.hostId });
}

async function recordRoundResult(room) {
  const sb = getClient();
  if (!sb || !room.lastResult) return;
  const r = room.lastResult;
  await sb.from('rounds').insert({
    room_id: room.roomId,
    round_number: room.round,
    pot_amount: r.potAmount || 0,
    winner_ids: r.winnerIds || [],
    winner_is_bitch: !!r.winnerIsBitch,
    evaluations: r.evaluations || [],
    bitch_hand: r.bitchHand || null,
  });
  // Update chip totals.
  const rows = room.players.map((p) => ({
    room_id: room.roomId,
    player_id: p.id,
    name: p.name,
    chips: p.chips,
  }));
  await sb.from('player_chips').upsert(rows);
}

module.exports = { recordRoomCreated, recordRoundResult };
