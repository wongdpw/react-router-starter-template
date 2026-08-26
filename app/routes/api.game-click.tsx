import type { Route } from "./+types/api.game-click";
import { isGameId } from "../lib/game-ids";

/**
 * Records that somebody opened a game.
 *
 * Called with `keepalive` as the browser navigates away, so it must stay
 * cheap and must never block the navigation.
 */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "method not allowed" }, { status: 405 });
	}

	let body: { game?: unknown; visitor?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return Response.json({ error: "bad body" }, { status: 400 });
	}

	if (!isGameId(body.game) || typeof body.visitor !== "string" || !body.visitor) {
		return Response.json({ error: "bad request" }, { status: 400 });
	}

	const ns = context.cloudflare.env.GAME_STATS;
	const stub = ns.get(ns.idFromName("global"));
	const res = await stub.fetch("https://stats/click", {
		method: "POST",
		body: JSON.stringify({ game: body.game, visitor: body.visitor }),
	});

	return Response.json(await res.json(), { status: res.status });
}

/** Nothing to render — a POST-only endpoint. */
export async function loader() {
	return Response.json({ error: "not found" }, { status: 404 });
}
