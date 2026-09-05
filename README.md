# Hop Home — visual style pass to match Bug Blaster / Galaxy Swarm

## What changed
Rendering only, in `app/routes/hop-home.tsx`. Compared Hop Home's draw
functions against Galaxy Swarm's (`drawAlien`, `drawPlayer`) and found
Hop Home had drifted toward a softer, painterly style — radial/linear
gradients, translucent shadows, sine-wave water lines, bark-grain
hatching — while Galaxy Swarm (and by extension the rest of the arcade)
uses flat, solid-fill silhouettes with black accent shapes and no
gradients or soft alpha shading.

Rewrote every draw function to match that flat-silhouette language:
- **Cars**: dropped the shadow + quadratic curves + soft windshield
  highlight; now a squared polygon body with a solid black cabin block,
  same shape language as the alien/ship silhouettes.
- **Log**: dropped the linear gradient and grain hatching; flat bark
  fill with a simple two-tone end-grain ring.
- **Turtle**: dropped the radial gradient shell and soft rgba shading;
  flat green shell fill, black shell-line strokes.
- **Frog**: dropped the radial gradient body and soft double-ring eyes;
  flat fill body + single solid black eye dots, same as the alien eyes
  in Galaxy Swarm.
- **Road/river texture**: dropped the speckle noise and sine-wave
  ripple lines; flat dash markings for both, matching the flat starfield
  dot approach used elsewhere.
- **HUD**: SCORE text changed from green to gold (`#FACC15`) to match
  Galaxy Swarm's HUD color; home slots use flat fills instead of
  translucent ones.

## What did NOT change
All game logic — lane building, obstacle movement, collision detection,
scoring, round/lives handling, high-score reporting, sound calls — is
byte-for-byte identical to what you uploaded. This was a pure rendering
pass, same approach used for the earlier graphics rewrite in this repo.

## After dragging the file in
1. Replace `app/routes/hop-home.tsx` with this version
2. `npm run dev`, open `/hop-home`, confirm it plays the same but looks
   flatter/bolder, closer to Galaxy Swarm and Bug Blaster
3. `git add . ; git commit -m "Match Hop Home visuals to arcade style" ; git push`

Note: I only had `hop-home.tsx`, `galaxy-swarm.tsx`, and
`bug-blaster.online.tsx` (the online-lobby page, not the game canvas) to
compare against. If Bug Blaster's actual game canvas uses a noticeably
different style than Galaxy Swarm, let me know and I can adjust further.
