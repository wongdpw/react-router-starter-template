# Moon Patrol: menu bar + smaller framed game

The site header was already in the route, but it never showed: the static
file public/moon-patrol.html shadows the /moon-patrol URL (both Vite dev
and Cloudflare serve extensionless URLs from matching .html files), so the
raw game was served full-screen instead of the React page.

1. Add these two files:
   - app/routes/moon-patrol.tsx        (header + centered 920px framed game)
   - public/moon-patrol-game.html      (the game, renamed)
2. DELETE public/moon-patrol.html — required. If it stays, it keeps
   shadowing /moon-patrol and nothing changes.
3. npm run dev → open /moon-patrol: menu bar on top, game in a bordered
   ~920px frame like the other game pages.
