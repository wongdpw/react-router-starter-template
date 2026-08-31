# Arcade sounds for Bug Blaster and Galaxy Swarm

All audio is synthesised with the Web Audio API — no sound files to ship.

## New file
- app/lib/arcade-sound.ts  — shared synth engine + named voices

## Replaced files
- app/routes/bug-blaster.tsx
- app/routes/galaxy-swarm.tsx

## What you'll hear
Bug Blaster:  shot blip, mushroom chip, segment hit, deeper kill for a
              chain head, a low two-note march pulse in time with the
              crawler's steps (it speeds up as waves get faster),
              death rumble, wave-up fanfare, game-over cadence.
Galaxy Swarm: shot blip, hit, bigger kill for a diving raider (worth
              double), a swooping tone when a sortie peels off, enemy
              shot tick, death rumble, wave-up fanfare, game-over cadence.

## Notes
- Audio can only start after a user gesture, so the context is created on
  the first key press. Nothing plays on the title screen before you press
  a key — that's browser policy, not a bug.
- A "Sound: on/off" button sits under each game. The choice is remembered
  in localStorage and shared by both games.
- Moon Patrol already had its own sound and is untouched.
