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
	route("draw-battle", "routes/draw-battle.tsx"),
	route("admin", "routes/admin.tsx"),
	route("admin/login", "routes/admin.login.tsx"),
] satisfies RouteConfig;
