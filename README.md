# Spore Field: score row no longer cut off

## The cause
Two things compounded:
1. The game's canvas is CSS-sized (width:100%, height:auto) with no height
   ceiling, so at 620px wide it renders 661px tall. With the marquee, HUD,
   legend and padding that's ~950px of content inside a 700px iframe.
2. The page centred that too-tall cabinet with align-items:center, so the
   overflow was split top and bottom — pushing the score HUD up out of
   view and leaving the scrollbar you saw.

## The fix
- Canvas now caps at calc(100dvh - 292px), so the playfield can never
  push the HUD off-screen on a short viewport.
- Page aligns to flex-start instead of centre, so the top of the cabinet
  is always the first thing visible.
- Iframe raised 700 -> 1000px, which is enough for the full-width 620x661
  playfield plus all its furniture (953px used, 47px spare).

The 292px reserve is measured from the actual chrome: padding 40, marquee
90, gaps 42, HUD 40, legend+footer 80.

## Files
- public/spore-field-game.html  (canvas max-height + top alignment)
- app/routes/spore-field.tsx    (iframe height 700 -> 1000)
