import { DurableObject } from "cloudflare:workers";
import { GAME_IDS, isGameId, type GameId } from "../app/lib/game-ids";

export type GameCounts = Record<string, number>;

/** Stop one browser from filling storage by cycling its visitor id. */
const MAX_VISITORS_PER_GAME = 50_000;

/**
 * A single instance — addressed with `idFromName("global")` — holding the play
 * count for every game.
 *
 * A Durable Object rather than R2 because these are counters: it is
 * single-threaded, so two people pressing Play at the same moment can't read
 * the same value and both write back the same increment.
 */
export class GameStats extends DurableObject<Env> {
	private counts: GameCounts | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.counts = (await ctx.storage.get<GameCounts>("counts")) ?? {};
		});
	}

	private all(): GameCounts {
		const counts = this.counts ?? {};
		// Always answer for every game, so the page never has to guess.
		const out: GameCounts = {};
		for (const id of GAME_IDS) out[id] = counts[id] ?? 0;
		return out;
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/counts") {
			return Response.json(this.all());
		}

		if (url.pathname === "/click" && request.method === "POST") {
			let body: { game?: unknown; visitor?: unknown };
			try {
				body = (await request.json()) as typeof body;
			} catch {
				return Response.json({ error: "bad body" }, { status: 400 });
			}

			const game = body.game;
			const visitor = typeof body.visitor === "string" ? body.visitor.slice(0, 64) : "";
			if (!isGameId(game) || !visitor) {
				return Response.json({ error: "bad request" }, { status: 400 });
			}

			const seenKey = `seen:${game}:${visitor}`;
			if (await this.ctx.storage.get(seenKey)) {
				// Already counted this person for this game.
				return Response.json({ counted: false, counts: this.all() });
			}

			const counts = this.counts ?? {};
			const tally = (counts[`visitors:${game}`] ?? 0) + 1;
			if (tally <= MAX_VISITORS_PER_GAME) {
				await this.ctx.storage.put(seenKey, 1);
				counts[`visitors:${game}`] = tally;
			}
			counts[game as GameId] = (counts[game as GameId] ?? 0) + 1;
			this.counts = counts;
			await this.ctx.storage.put("counts", counts);

			return Response.json({ counted: true, counts: this.all() });
		}

		return new Response("Not found", { status: 404 });
	}
}
