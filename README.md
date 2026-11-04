# Coup Royale

A complete, real multiplayer Coup game for **3–15 people**. React + Vite frontend, authoritative Node.js + Socket.IO backend. The frontend deploys to Vercel; the backend deploys to Render. No AI, music, or paid gameplay API is required.

## New table options

- **Normal / Bright Beta** in the header changes appearance and remembers your choice on this device.
- **Free for all** supports 3–15 players. Select the table capacity when hosting.
- **Team vs team** supports two equal teams, 2v2 through 7v7. Players join the smaller team automatically and can choose A or B in the waiting room. Team changes reset everyone's readiness. The host starts once teams are equal and all guests are ready.
- Team turns are interleaved at the start. Attacks, challenges, and blocks are against opponents only. Teammates can see each other’s current cards and coin balances; opponents cannot. The whole team wins when the opposing team has no living influence. After eliminations, turns continue through the surviving seats.
- Expanded decks contain enough cards for every hand and an exchange. This is a larger-table house variant.
- Challenge results keep the existing sounds and effects and show the supplied image: `public/images/bluff-caught.jpeg` for a caught bluff, `public/images/claim-true.png` for a proved claim.
- No extra service, dependency, or environment variable is required. Existing Vercel and Render auto-deploy connections can deploy the changes from `main`. Both frontend and backend must finish deploying before using the new room options. A backend deployment can reset active tables on ephemeral hosting, as described below.

## Start locally

Install **Node.js 22.9 or newer** (Node 24 recommended). Extract this folder and open a terminal inside it:

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. There is no configuration required for local play. This command starts both the frontend and backend. To test on one laptop, use **three separate tabs**, choose a different nickname in each, create a room, and join its code from the other two. Guest players must click Ready; the host then starts the game. A refreshed tab restores its existing seat.

`npm run dev` requires the default backend port 3001 to be free. It accepts `-- --port 4173` to change the frontend port when needed. Development accepts proxied preview origins; the deployed backend strictly checks `CLIENT_ORIGINS`.

## Included

- Public room browser and private invitation codes/links; 3–15 seats with host controls.
- Five character types; 3 copies each for 3–6 players, 6 each for 7–12, and 9 each for 13–15; two hidden cards and two coins per player.
- Income, foreign aid, tax, steal, assassinate, exchange, and coup.
- Separate challenge and block windows; character claims may be bluffs.
- Correct influence selection, proof replacement, mandatory coups, double losses on failed assassination defenses, elimination, winner, and rematch.
- Previous winner starts the next match when still seated. First match starts randomly.
- **Private coin balances** in individual games, shared within the team in team games. Actions and coin transfers are public and may reveal clues about balances. The bank is unlimited.
- Private exchange choices; only the exchanging player receives the drawn options. Teammates see the held hand, updated after the exchange.
- Card dealing, hover movement, flips, lost influence stamps, challenge reveals, and winner confetti.
- Original SVG character illustrations; no external image service needed.
- Original synthesized suspense and celebration sounds, plus the exact supplied loss clip at `public/audio/challenge-lost.mp3`.
- Mute and volume controls; reduced motion support; laptop and phone layouts.
- Table chat and game history. Eliminated players may stay and chat.
- A leaderboard in the waiting room and game sidebar, with player wins/played for both modes and team totals for team games. Results belong to that room and persist across rematches and stored room snapshots. A removed/rejoining seat is a new player record.
- Refresh/reconnect sessions, host migration, server timers, and room snapshots.

## Deploy the backend on Render

1. Put this project’s contents in a GitHub repository. Keep `package.json`, `package-lock.json`, `server/`, `src/`, and `public/` at the repository root. Do not upload `node_modules`, `.data`, or `.env`.
2. In Render, create **New → Web Service**, connect that repository, and select the Node runtime.
3. Use these settings:

| Setting | Value |
| --- | --- |
| Root directory | Leave blank if `package.json` is at repository root |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check path | `/health` |
| Instance count | **1** |
| `NODE_ENV` | `production` |
| `CLIENT_ORIGINS` | Your exact Vercel origin, such as `https://your-coup.vercel.app` |
| `DATA_DIR` | `/tmp/coup-royale` for an initial free deployment |

Render supplies `PORT` automatically. If you don’t have the Vercel URL yet, use `http://localhost:5173` temporarily for `CLIENT_ORIGINS`, then replace it after the frontend is deployed. The game won’t connect from Vercel until the actual origin is allowed.

4. Deploy and copy the Render HTTPS service origin, for example `https://your-coup-server.onrender.com`. Opening `/health` should show `{"ok":true,"game":"Coup Royale"}`.

A `render.yaml` blueprint is also included for the same free-service setup. `CLIENT_ORIGINS` is an input you supply when creating it.

## Deploy the frontend on Vercel

1. Import the same GitHub repository into Vercel.
2. Select **Vite** as the framework, build command `npm run build`, and output directory `dist`. `vercel.json` supplies these defaults.
3. Add this **frontend** environment variable:

```text
VITE_SERVER_URL=https://your-coup-server.onrender.com
```

Use the real Render origin, with HTTPS and no trailing slash. This value is public configuration, not a secret. Never put a private credential in a `VITE_` variable.

4. Deploy. Copy the Vercel production origin and set Render’s `CLIENT_ORIGINS` to that exact value, with no trailing slash and no path. Save/redeploy the Render environment.
5. Open the Vercel site. The lobby should say **Tables are open**. Create a room and send friends the invite link.

For multiple approved frontend origins, use comma separation:

```text
CLIENT_ORIGINS=https://your-coup.vercel.app,https://coup.example.com
```

Preview deployments have different origins. Add an exact preview origin if you want to play there. A change to `VITE_SERVER_URL` requires a new Vercel frontend build. Don’t deploy `server/index.mjs` as an in-memory Vercel function: this project intentionally keeps room coordination on one Render service.

## Reconnection, persistence, and free hosting limits

**This project has not been deployed to your Vercel or Render accounts.** The configurations and source are ready for you to deploy.

The included free Render setup is suitable for an initial friends-and-family game. Free services can sleep when inactive and take time to wake. Their filesystem is ephemeral: **rooms and seat sessions may be lost when the service restarts or redeploys.** Refresh recovery works while the server still has the room. A frontend deployment alone does not reset backend rooms.

The backend writes atomic JSON snapshots after state changes. On a persistent disk these restore rooms and cards across backend restarts. To enable that, use a host/plan with a persistent disk and set `DATA_DIR` to a directory inside its mount, such as `/var/data/coup`. Keep that directory private: snapshots contain hidden hands and hashed seat credentials. It must never be published or included in the frontend assets.

Run **one backend instance**. File-backed rooms are not a multi-server database. Horizontal scaling requires a shared datastore and coordinated room ownership; it is not included in this version.

Seat credentials use `sessionStorage`, so refreshing the same tab restores the seat. Closing the tab or clearing its session storage may make the seat unrecoverable. Don’t share a seat token; share the invite link. Leaving explicitly forfeits your influences and invalidates your seat token. A connection opened with an existing seat token replaces that seat’s previous connection.

Completely offline tables pause instead of simulating the entire game without players. Once someone rejoins, an expired phase executes its timeout fallback. Empty waiting/finished rooms expire after about two hours; completely offline active matches expire after about 24 hours without activity, subject to hosting persistence.

## Rules and timing

The base rules follow the five-character Coup game. House changes: **3–15 players in free for all, hidden coin balances, and an unlimited bank**. Timers and host controls make the rules usable online.

- Each turn chooses exactly one action. No passing the main turn.
- Character actions may be challenged by any other living player. Claims are automatically proved if the claimant has a matching live card. On proof, that card is shuffled into the court before drawing a random replacement; it may be drawn again.
- The loser of a challenge chooses one influence to reveal. After a failed action claim, the action is cancelled. A challenged bluff Assassin receives its action cost back if still alive; an eliminated player returns all coins to the bank.
- Character challenges resolve before block windows. Any opponent can claim Duke to block foreign aid. Only the target can block stealing or assassination. Blocks may be challenged by any other living player.
- A failed Contessa bluff can cost one card for the failed block and one for the assassination. Challenging a truthful Assassin can likewise cost two influences.
- After a foreign-aid blocker is caught bluffing, other opponents who have not already passed or attempted a block get a chance to block it. A player gets one block attempt on that action. Simultaneous claims are processed in server arrival order.
- A block that stands cancels the action; an assassination fee remains spent.
- Steal transfers up to two coins, taking fewer if necessary. Exact transfer amounts appear in the public history; coin balances remain private.
- At the start of a turn with 10+ coins, Coup is the only legal action. It costs seven coins and cannot be challenged or blocked. The target chooses a live card to lose.
- Exchanges draw two court cards. Keep as many cards as you have live influences, and return exactly two. Revealed cards stay revealed.
- The host chooses a response window of 15, 20, or 30 seconds. All unresolved responses automatically pass at the deadline; a manual pass cannot be changed for that prompt.
- Turns, loss choices, and exchanges each allow 60 seconds. A missed turn takes Income, or performs a mandatory Coup against the next living opponent. A missed loss reveals the first hidden card. A missed exchange keeps the first available cards (the player’s existing hidden cards).
- When several players respond at the same time, the first valid command processed by the server wins. Phase IDs reject stale commands.

## Sounds

First click/tap/keypress activates browser audio. Suspense plays when a challenge is called. On both truthful claims and caught bluffs, in either game mode, the supplied loss sound plays followed by the original celebration jingle. The clip is decoded into the unlocked audio context, with HTML audio as a fallback. All connected viewers hear the same result cues. A final winner gets a longer celebration. Users can mute or adjust volume from the header. Browsers can still restrict autoplay, especially inside embedded frames; play the deployed app directly for normal audio behavior.

## Leaderboard scope

Leaderboards are per table and start recording completed matches from this update. Every participant gets one played match; the individual winner or every member of the winning team gets one win, including eliminated teammates. Results remain across rematches while the room exists. Old room snapshots without score fields start with an empty board. The same hosting persistence limits as rooms apply; this is not an account-based global ranking.

## Verification

```bash
npm test
npm run build
```

Automated coverage includes rule outcomes, private state projections, invalid and stale commands, exchanges at one/two influence, card conservation in simulated 3–6 player matches, real Socket.IO clients, discovery, joining, readiness, chat, refresh/reconnect credentials, origin checks, rematches, and disk restore. Browser checks exercised room creation, three players readying, a truthful claim challenge, selecting a lost card, and completing an exchange. The lobby was visually inspected at desktop and 390px widths.

## Project map

```text
src/App.jsx          Lobby, rooms, table, prompts, chat, and effects
src/cards.jsx        SVG character art and animated card components
src/audio.js         Original synthesized sounds and supplied MP3 playback
src/styles.css       Responsive midnight-and-gold interface
server/engine.mjs    Rules and private state projection
server/index.mjs     Rooms, sessions, sockets, snapshots, and timers
server/dev.mjs       Combined local development command
public/audio/        Supplied challenge-loss sound
test/                Rules and real-network integration tests
vercel.json          Vercel frontend deployment settings
render.yaml          Render backend blueprint
```

## Troubleshooting

- **Connecting to server…:** Render may be waking. Check the Render `/health` URL, frontend `VITE_SERVER_URL`, and exact backend `CLIENT_ORIGINS`. Use HTTPS for both deployed services. Browser extensions or network rules can also block sockets.
- **Room not found after a restart:** on the free configuration, this is expected if ephemeral storage was reset. Create a new room, or configure durable storage.
- **Can’t start:** at least three players must be seated, connected, and ready (the host is implicitly ready). The host can remove offline guests between matches.
- **An old prompt was rejected:** another response already advanced the phase. Use the current prompt.
- **Sound is silent:** tap the page, enable sound, and raise the in-app volume; also check browser/site mute settings.
- **Local port occupied:** close the previous development server. Port 3001 is reserved for the local game backend.

Reference docs: [Render WebSockets](https://render.com/docs/websocket), [Render free services](https://render.com/docs/free), [Render disks](https://render.com/docs/disks), [Vite environment variables](https://vite.dev/guide/env-and-mode), and [publisher Coup page](https://indieboardsandcards.com/our-games/coup/).
