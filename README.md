# Fours & Eights

A real-time multiplayer card game where 4s and 8s are wild and the pot escalates.
Best four-of-a-kind wins, ties are settled by drawing the top card, and a lone
holdout plays against The Bitch — who can hit five of a kind.

## What's in v2

- **30-second turn timer.** Time out and you fold OUT (or stand pat on a draw).
- **Custom avatars.** Pick from 16 emoji + 8 colors, or upload an image (needs
  Supabase Storage).
- **Solo Practice mode.** Open a 1-player room and play head-to-head against
  The Bitch every hand.
- **2-10 players** per multiplayer room.
- **Game continues if players leave.** Auto-fold, host transfer, no stalling.
- **Dealer rotates left each round.** Turn order rotates with it.

## Stack

- **Next.js / React** — UI and pages
- **Node.js + Socket.io** — real-time multiplayer over WebSockets
- **Supabase** — (optional) round history and chip leaderboards
- **Vercel / Render / Railway** — deployment (see DEPLOY.md for the caveat)

## Project structure

```
fours-and-eights/
├── lib/
│   ├── deck.js              # 52-card deck, shuffle, deal, redraw
│   ├── evaluator.js         # Wild-card hand evaluator (4s & 8s wild)
│   ├── game.js              # Game state machine, rounds, pot, rollover
│   ├── persistence.js       # Optional Supabase integration
│   └── socketClient.js      # Browser-side socket helper
├── server/
│   └── index.js             # Custom Next.js + Socket.io server
├── pages/
│   ├── _app.js
│   └── index.js             # Lobby + game table
├── components/
│   ├── Card.js              # Playing card
│   └── Seat.js              # Opponent seat
├── styles/
│   ├── globals.css
│   ├── Card.module.css
│   ├── Seat.module.css
│   └── Table.module.css
├── package.json
├── next.config.js
├── .env.example
└── DEPLOY.md
```

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000 in two browser windows (or one window + a phone on
the same Wi-Fi) to play with yourself. Open a table in one window, share the
room code with the other, then click **Deal the round**.

## Game flow

1. **Lobby** — host clicks *Open a Table*, gets a 6-character room code, shares it.
2. **Ante** — every player auto-antes 1 chip plus any rollover they owe from
   losing the previous round.
3. **Deal** — each player gets 4 private cards.
4. **Decision** — each player chooses **IN** or **OUT** after seeing their hand.
5. **Draw** — IN-players may discard any number of cards and redraw once.
6. **Showdown** — hands are revealed, the evaluator picks the best wild-card
   interpretation, and the highest wins. Ties draw the next top card.
7. **Settle** — the winner takes the pot. Losing IN-players each owe the pot
   amount as a rollover into the next round, which inflates the next pot.

## The Bitch

If only one player stays IN, they play against The Bitch instead of folding-by-
default-winning. The Bitch is dealt the top 5 cards of the deck and uses the
best wild-card interpretation. Because she has 5 cards, she can hit
**five of a kind**, which beats four aces.

## Wild card evaluator

The evaluator enumerates every possible rank assignment for the wild cards and
returns the highest-scoring interpretation. With at most 4 wilds in a 4-card
hand, the search space is at most 13⁴ ≈ 28k combinations, which runs in well
under a millisecond. See `lib/evaluator.js`.

## Persistence (optional)

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to record round outcomes.
The schema is in the comment at the top of `lib/persistence.js` — paste it into
the Supabase SQL editor.

## Deployment

See **DEPLOY.md**. The short version: Vercel doesn't run persistent WebSocket
servers, so deploy the Socket.io process to Render or Railway and point
`NEXT_PUBLIC_SOCKET_URL` at it from Vercel — or host the whole thing on Render.
