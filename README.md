# Galaga and Lunar Buggy: bigger in their frames

## The cause
Both games scale to fit the *browser viewport*, subtracting a fixed chunk
for the page furniture they expect around them when opened standalone
(Galaga -240px, Lunar Buggy -300px of height). Inside our iframe that
allowance is far too big, so the height term won the min() and both
games were pinned at 1x:

  Galaga       224x288 native -> rendered 224x288  (1x)
  Lunar Buggy  384x216 native -> rendered 384x216  (1x)

Spore Field looked right because it sizes off width, not height.

## The fix
- Trimmed each game's chrome budget to what its own UI actually needs
  (Galaga -190, Lunar Buggy -180) and let Galaga use half-step scaling
  instead of whole integers only.
- Raised the Galaga iframe to 820px so its tall 224x288 screen has room
  to reach 2x.

Result:
  Galaga       -> 2x   (448x576)
  Lunar Buggy  -> 2x   (768x432)

Lunar Buggy is width-bound, so it reaches 2x at its existing frame height;
only the chrome budget mattered there.

## Files
- public/galaga-game.html       (fit() budget + half-step scaling)
- public/lunar-buggy-game.html  (fit() budget)
- app/routes/galaga.tsx         (iframe height 700 -> 820)
- app/routes/lunar-buggy.tsx    (iframe height 620 -> 640)
