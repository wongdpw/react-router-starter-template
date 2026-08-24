import type { PackedOp } from "./drawing-codec";

/** Wire contract for Squiggle Challenge rooms. */

export type SquigglePhase = "lobby" | "drawing" | "reveal" | "roundend" | "gameover";

export const MIN_PLAYERS = 2;
/**
 * Capped at 8 rather than 10: every entry is delivered at reveal, and this
 * keeps the total comfortably inside the WebSocket frame budget.
 */
export const MAX_PLAYERS = 8;

export const SECONDS_CHOICES = [60, 90, 120] as const;
export const ROUND_CHOICES = [1, 3, 5] as const;

export const VOTE_MS = 60_000;
export const ROUND_GAP_MS = 10_000;
export const MAX_CHAT = 60;
export const MAX_CHAT_LEN = 120;

/** Tighter than the shared cap, since N entries ship at once. */
export const MAX_ENTRY_BYTES = 60_000;

export const POINTS_PER_VOTE = 2;
export const ROUND_WINNER_BONUS = 3;

export interface SquiggleSettings {
	rounds: number;
	seconds: number;
}

export interface SquigglePlayer {
	id: string;
	name: string;
	connected: boolean;
	ready: boolean;
	score: number;
	submitted: boolean;
	/** Populated from the reveal onward. */
	votes?: number;
	lastDelta?: number;
}

export type SquiggleChatKind = "chat" | "system" | "join" | "leave";

export interface SquiggleChatEntry {
	id: string;
	kind: SquiggleChatKind;
	from?: string;
	text: string;
	at: number;
}

export interface SquiggleState {
	code: string;
	phase: SquigglePhase;
	settings: SquiggleSettings;
	players: SquigglePlayer[];
	hostId: string | null;

	round: number;
	endsAt: number | null;
	serverNow: number;

	/** The shared starting mark — identical for everyone. */
	squiggle: PackedOp[];
	/** Ids whose entries are being delivered this reveal. */
	revealIds: string[];
	youVoted: string | null;
	roundWinnerIds: string[];
}

export type SquiggleClientMsg =
	| { t: "setName"; name: string }
	| { t: "setSettings"; settings: Partial<SquiggleSettings> }
	| { t: "ready"; value: boolean }
	| { t: "start" }
	/** `final` marks "I'm done"; anything else is a pre-deadline auto-save. */
	| { t: "submit"; ops: PackedOp[]; final?: boolean }
	| { t: "vote"; targetId: string }
	| { t: "chat"; text: string }
	| { t: "playAgain" };

export type SquiggleServerMsg =
	| { t: "welcome"; you: { id: string }; state: SquiggleState; chat: SquiggleChatEntry[] }
	| { t: "state"; state: SquiggleState }
	/** Entries arrive one per message so no single frame gets huge. */
	| { t: "entry"; playerId: string; ops: PackedOp[] }
	| { t: "chat"; entry: SquiggleChatEntry }
	| { t: "error"; message: string };
