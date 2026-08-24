import type { PackedOp } from "./drawing-codec";

/** Wire contract for Fake Artist rooms. */

export type FakePhase =
	| "lobby"
	/** Everyone privately sees their role and, if they know it, the word. */
	| "reveal"
	/** One stroke each, going around. */
	| "drawing"
	/** Everyone accuses somebody. */
	| "voting"
	/** The faker was caught and gets one shot at naming the word. */
	| "fakeguess"
	| "roundend"
	| "gameover";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const PASS_CHOICES = [1, 2, 3] as const;
export const ROUND_CHOICES = [1, 3, 5] as const;
export const STROKE_SECONDS_CHOICES = [15, 25, 40] as const;

export const REVEAL_MS = 6_000;
export const VOTE_MS = 60_000;
export const FAKE_GUESS_MS = 30_000;
export const ROUND_GAP_MS = 9_000;
export const MAX_CHAT = 60;
export const MAX_CHAT_LEN = 120;

/** Faker survives the vote, or is caught but names the word. */
export const FAKE_WIN_POINTS = 5;
/** Awarded per player who correctly fingered the faker. */
export const CATCH_POINTS = 3;

export interface FakeSettings {
	rounds: number;
	/** How many times the turn order goes around before voting. */
	passes: number;
	strokeSeconds: number;
	categories: string[];
}

export interface FakePlayer {
	id: string;
	name: string;
	connected: boolean;
	ready: boolean;
	score: number;
	/** Strokes contributed this round. */
	strokes: number;
	/** Only populated once the round is over. */
	wasFake?: boolean;
	votedFor?: string | null;
	lastDelta?: number;
}

export type FakeChatKind = "chat" | "system" | "join" | "leave";

export interface FakeChatEntry {
	id: string;
	kind: FakeChatKind;
	from?: string;
	text: string;
	at: number;
}

export interface FakeState {
	code: string;
	phase: FakePhase;
	settings: FakeSettings;
	players: FakePlayer[];
	hostId: string | null;

	round: number;
	/** Which pass around the table we're on, 1-based. */
	pass: number;
	/** Whose stroke it is right now. */
	activeId: string | null;
	/** Draw order for this round. */
	order: string[];

	endsAt: number | null;
	serverNow: number;

	/** Always visible — it is the faker's only foothold. */
	category: string | null;
	/**
	 * The secret. Sent to everyone except the faker during play, and to
	 * everyone once the round is over.
	 */
	word: string | null;
	/** True only for the client that is the faker. */
	youAreFake: boolean;
	youVoted: string | null;

	/** Populated from the voting phase onward. */
	votes: { voterId: string; targetId: string }[] | null;
	accusedId: string | null;
	fakeId: string | null;
	fakeGuess: string | null;
	fakeWon: boolean | null;
	/** Live canvas, so a late joiner or reconnect sees the drawing. */
	canvas: PackedOp[];
}

export type FakeClientMsg =
	| { t: "setName"; name: string }
	| { t: "setSettings"; settings: Partial<FakeSettings> }
	| { t: "ready"; value: boolean }
	| { t: "start" }
	/** One stroke, which immediately ends your turn. */
	| { t: "stroke"; op: PackedOp }
	| { t: "vote"; targetId: string }
	| { t: "fakeGuess"; word: string }
	| { t: "chat"; text: string }
	| { t: "playAgain" };

export type FakeServerMsg =
	| { t: "welcome"; you: { id: string }; state: FakeState; chat: FakeChatEntry[] }
	| { t: "state"; state: FakeState }
	| { t: "chat"; entry: FakeChatEntry }
	| { t: "error"; message: string };
