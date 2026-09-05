# Fix: canvas games rendering off-center

## Root cause
Tailwind's Preflight reset (pulled in via `@import "tailwindcss"` in
app.css) sets `canvas, iframe, img, svg, video { display: block }`
globally. All three canvas games centered their canvas using the
PARENT'S `text-align: center` — which only works on inline/inline-block
content. A block-level element ignores text-align entirely; its position
depends on its own margin. With none set, the canvas had no defined
horizontal position, leaving it vulnerable to drifting off-center
depending on browser, font-loading timing, and viewport specifics.

The five iframe-based games (Moon Patrol, Defender, Galaga, Lunar Buggy,
Spore Field) were unaffected — they use width:100% rather than relying
on centering.

## The fix
Added explicit `margin: "0 auto"` (plus `display: "block"` for clarity)
to the canvas style in all three affected games. This centers a
block-level element unambiguously, independent of text-align, Preflight,
or any browser-specific quirk.

## Files
- app/routes/hop-home.tsx
- app/routes/bug-blaster.tsx
- app/routes/galaxy-swarm.tsx

## Verification
- npm run typecheck / build: clean
- Reproduced the real production Preflight CSS in a standalone headless
  render and confirmed the fixed version centers correctly. My headless
  tool did not reproduce the exact off-center symptom from your
  screenshot (likely an older rendering engine that handles Preflight's
  cascade or font-loading timing differently from a real browser) — so
  please confirm on your end after deploying that it now looks right in
  an actual browser, with DevTools closed.
