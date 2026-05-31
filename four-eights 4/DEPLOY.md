# Deployment

The tricky part: **Vercel's serverless functions do not support long-lived
WebSocket connections.** You have three paths. Pick one.

## Path A — All-in-one on Render or Railway (easiest)

Render and Railway both run persistent Node processes, which is exactly what
Socket.io needs.

### Render

1. Push this repo to GitHub.
2. On Render, click **New > Web Service** and connect the repo.
3. Configure:
   - **Environment**: Node
   - **Build command**: `npm install && npm run build`
   - **Start command**: `npm start`
4. Add env vars from `.env.example` (Supabase keys are optional).
5. Deploy. Your app is live at `https://<service>.onrender.com`.

### Railway

1. Push to GitHub.
2. On Railway, **New Project > Deploy from GitHub repo**.
3. Railway auto-detects Node. Set the start command to `npm start` if needed.
4. Add env vars.
5. Deploy. Use the public domain Railway gives you.

## Path B — Vercel for the UI + Render/Railway for sockets (split)

Best if you want Vercel's edge CDN for the static assets but still need
real-time multiplayer.

1. Deploy `server/index.js` to Render or Railway following Path A. Note its
   URL, e.g. `https://fours-eights-sockets.onrender.com`.
2. On Vercel, import the same repo. Add an env var:
   - `NEXT_PUBLIC_SOCKET_URL = https://fours-eights-sockets.onrender.com`
3. In Vercel's project settings, set the build command to `next build` and
   the output directory to `.next`. The custom server file (`server/index.js`)
   won't run on Vercel — Vercel will serve Next.js pages itself, and the
   browser will connect to the Render socket server via the env var.
4. Deploy. Open the Vercel URL.

Important: this means two separate deployments to keep in sync. If you change
`lib/game.js` you must redeploy both.

## Path C — Use Pusher or Ably instead of Socket.io

If you want everything on Vercel, swap Socket.io for a hosted realtime service
(Pusher, Ably, Supabase Realtime). The game logic in `lib/` is fully decoupled
from the transport, so you'd rewrite `server/index.js` and `lib/socketClient.js`
against the new API. Not done in this scaffold — start with Path A or B.

## Supabase setup (optional)

1. Create a project at supabase.com.
2. In the SQL editor, paste the schema from the top comment of
   `lib/persistence.js` and run it.
3. Copy your project URL and **service_role** key into the deployment env vars
   as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. The persistence layer is opt-in — if those env vars are missing, the game
   runs fine without recording anything.

## Health check

Once deployed, visit the root URL. You should see the lobby. Open two browser
windows pointed at it, create a table in one, paste the room code in the other,
and click **Deal the round**. If both windows show updated state in real time,
sockets are wired up correctly.

## Scaling beyond one process

The current code keeps rooms in memory on a single Node process, which is fine
for hundreds of concurrent rooms on one box. To scale horizontally:

- Add the Socket.io Redis adapter (`@socket.io/redis-adapter`) so room events
  propagate across instances.
- Move room state out of the in-memory `Map` in `server/index.js` into Redis
  or Supabase so any instance can serve any room.
- Configure your host (Render/Railway) for sticky sessions, since Socket.io
  long-polling fallback needs the same client pinned to the same instance.
