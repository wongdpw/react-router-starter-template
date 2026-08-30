import { DurableObject } from "cloudflare:workers";
import { GAME_IDS, type GameId } from "../app/lib/game-ids";
import {
	isValidInitials,
	isScoreGameId,
	sortBoard,
	withScore,
	type ScoreBoard,
	type ScoreEntry,
} from "../app/lib/high-scores";

type Boards = Record<string, ScoreBoard>;

/** A single score can't be absurd enough to sit at the top for ever. */
const MAX_PLAUSIBLE_SCORE = 10_000_000;

/**
 * A single instance — addressed with `idFromName("global")` — holding one
 * top-ten table per game.
 *
 * A Durable Object for the same reason as GameStats: it is single-threaded,
 * so two players finishing at the same moment can't both read the same board
 * and write back a version missing the other's score.
 */
export class HighScores extends DurableObject<Env> {
	private boards: Boards | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.boards = (await ctx.storage.get<Boards>("boards")) ?? {};
		});
	}

	/** Always answer for every game, so the page never has to guess. */
	private all(): Boards {
		const boards = this.boards ?? {};
		const out: Boards = {};
		for (const id of GAME_IDS) out[id] = sortBoard(boards[id] ?? []);
		return out;
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/boards") {
			return Response.json(this.all());
		}

		if (url.pathname === "/submit" && request.method === "POST") {
			let body: { game?: unknown; who?: unknown; score?: unknown };
			try {
				body = (await request.json()) as typeof body;
			} catch {
				return Response.json({ error: "bad body" }, { status: 400 });
			}

			const game = body.game;
			const who = body.who;
			const score = body.score;

			if (
				!isScoreGameId(game) ||
				!isValidInitials(who) ||
				typeof score !== "number" ||
				!Number.isFinite(score) ||
				score <= 0 ||
				score > MAX_PLAUSIBLE_SCORE
			) {
				return Response.json({ error: "bad request" }, { status: 400 });
			}

			const boards = this.boards ?? {};
			const entry: ScoreEntry = { who, score: Math.floor(score), at: Date.now() };
			const next = withScore(boards[game as GameId] ?? [], entry);
			boards[game as GameId] = next;
			this.boards = boards;
			await this.ctx.storage.put("boards", boards);

			// Tell the client where it landed so it can highlight the row.
			const rank = next.findIndex((e) => e.at === entry.at && e.who === entry.who && e.score === entry.score);
			return Response.json({ board: next, rank: rank === -1 ? null : rank });
		}

		return new Response("Not found", { status: 404 });
	}
}
