import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("upload", "routes/upload.tsx"),
	route("gallery", "routes/gallery.tsx"),
	route("rising-stars", "routes/rising-stars.tsx"),
	route("art/:key", "routes/art.$key.tsx"),
	route("vote/:key", "routes/vote.$key.tsx"),
	route("updates", "routes/updates.tsx"),
	route("board", "routes/board.tsx"),
	route("games", "routes/games.tsx"),
	route("draw-battle", "routes/draw-battle.tsx"),
	route("guess", "routes/guess.tsx"),
	route("guess/room/:code", "routes/guess.room.$code.tsx"),
	route("fake-artist", "routes/fake-artist.tsx"),
	route("fake-artist/room/:code", "routes/fake-artist.room.$code.tsx"),
	route("draw-battle/online", "routes/draw-battle.online.tsx"),
	route("draw-battle/room/:code", "routes/draw-battle.room.$code.tsx"),
	route("admin", "routes/admin.tsx"),
	route("admin/login", "routes/admin.login.tsx"),
] satisfies RouteConfig;
