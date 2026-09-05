# Hop Home — original Frogger-style crossing game

Titled "Hop Home" rather than the trademarked name, same as the other
arcade games here. Hop through six lanes of traffic, then ride logs and
turtles (some of which submerge) across the river, into one of five open
home slots before the round timer runs out. Three lives, timer resets
each successful crossing, difficulty ramps each round via a speed
multiplier.

## New file
- app/routes/hop-home.tsx  — the game (canvas, no external assets)

## Replaced files
- app/routes.ts        — registers /hop-home
- app/lib/game-ids.ts  — adds "hop-home" (needed for high scores + the
                         play-count API's server-side whitelist)
- app/routes/games.tsx — adds the Hop Home card with original frog/lane art

## Wired in from the start
- Shared arcade high-score board (top 10, 3-letter initials)
- Shared arcade sound engine (hop, splash/hit, death, wave-up, win fanfare)
- "Sound: on/off" toggle, same as Bug Blaster and Galaxy Swarm

## Validation performed
- npm run typecheck / build — clean
- I also ported the pure game-update logic into standalone Node scripts
  and ran ~600 simulated lives (scripted bots) against it. Zero crashes,
  zero out-of-bounds, zero NaN, zero home-slot overfill across the whole
  run. This confirms the engine is structurally sound; it does NOT
  confirm the difficulty is well-tuned for a human, since my bots react
  slower and less holistically than a real player would. Please playtest
  and tell me if it feels too hard/easy/fast — the knobs are all at the
  top of the file (ROUND_SECONDS, lane gap/speed in buildLanes()).

## After dragging files in
1. npm run dev, open /hop-home
2. git add . ; git commit -m "Add Hop Home" ; git push
