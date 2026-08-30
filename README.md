# Arcade high scores — top 10 with 3-letter initials

Shared leaderboards for Bug Blaster, Moon Patrol and Galaxy Swarm, stored
server-side in a Durable Object so everyone sees the same board.

## New files
- app/lib/high-scores.ts          — shared types, sorting, validation
- app/components/HighScores.tsx   — useHighScores hook + board + initials prompt
- app/routes/api.high-scores.tsx  — GET all boards / POST a new score
- workers/high-scores.ts          — the HighScores Durable Object

## Replaced files
- app/routes.ts                 — registers /api/high-scores
- workers/app.ts                — exports the HighScores class
- wrangler.json                 — HIGH_SCORES binding + v8 migration
- app/routes/bug-blaster.tsx    — reports score on game over, shows board
- app/routes/galaxy-swarm.tsx   — same
- app/routes/moon-patrol.tsx    — listens for the iframe's score message
- public/moon-patrol-game.html  — posts its final score out to the page

## How it behaves
- Board is top 10, highest first; ties go to whoever got there first.
- When a run ends and the score would make the board, the "NEW HIGH SCORE"
  prompt appears; type 3 letters/digits and save. Your initials are
  remembered for next time. Skip just closes it.
- Your new row is highlighted after saving.
- Everything fails quietly: a scoreboard outage never breaks a game.

## After dragging files in
1. npm run cf-typegen   (Env types need HIGH_SCORES)
2. npm run dev          (play a game, lose, enter initials)
3. git add . ; git commit -m "Arcade high scores" ; git push
   (deploy applies the v8 Durable Object migration automatically)

Note: bug-blaster.tsx here is the repo's current 1-player version with
scores wired in — it is not the 2-player build from the earlier zip.
