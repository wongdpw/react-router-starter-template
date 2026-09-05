/**
 * Stable ids for the games on the hub.
 *
 * Shared by the games page and the stats Durable Object so a click can only
 * ever be recorded against a game that actually exists — the id arrives from
 * the browser, so it is checked against this list rather than trusted.
 */
export const GAME_IDS = [
	"daily",
	"draw-battle",
	"guess",
	"fake-artist",
	"squiggle",
	"doodle",
	"bug-blaster",
	"moon-patrol",
	"galaxy-swarm",
	"spore-field",
	"lunar-buggy",
	"galaga",
	"defender",
] as const;

export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: unknown): value is GameId {
	return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

/** Per-browser id used to count a play once per person rather than per click. */
export const VISITOR_KEY = "adsVisitorId";

export function visitorId(): string {
	try {
		const existing = window.localStorage.getItem(VISITOR_KEY);
		if (existing) return existing;
		const fresh = crypto.randomUUID();
		window.localStorage.setItem(VISITOR_KEY, fresh);
		return fresh;
	} catch {
		// Storage blocked — the click still counts, it just won't dedupe.
		return crypto.randomUUID();
	}
}
