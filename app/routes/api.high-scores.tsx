import type { Route } from "./+types/api.high-scores";
import { isGameId } from "../lib/game-ids";
import { isValidInitials } from "../lib/high-scores";

/** GET /api/high-scores — every game's top ten. */
export async function loader({ context }: Route.LoaderArgs) {
	const ns = context.cloudflare.env.HIGH_SCORES;
	try {
		const res = await ns.get(ns.idFromName("global")).fetch("https://scores/boards");
		return Response.json(await res.json());
	} catch {
		// A scoreboard hiccup must never take a game page down.
		return Response.json({});
	}
}

/** POST /api/high-scores — claim a place with three initials. */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "method not allowed" }, { status: 405 });
	}

	let body: { game?: unknown; who?: unknown; score?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return Response.json({ error: "bad body" }, { status: 400 });
	}

	if (!isGameId(body.game) || !isValidInitials(body.who) || typeof body.score !== "number") {
		return Response.json({ error: "bad request" }, { status: 400 });
	}

	const ns = context.cloudflare.env.HIGH_SCORES;
	const res = await ns.get(ns.idFromName("global")).fetch("https://scores/submit", {
		method: "POST",
		body: JSON.stringify({ game: body.game, who: body.who, score: body.score }),
	});

	return Response.json(await res.json(), { status: res.status });
}
