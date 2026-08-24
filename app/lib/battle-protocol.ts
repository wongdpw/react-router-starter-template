import type { BrushTool, Op } from "../components/DrawPad";
import type { PromptCategory } from "./draw-battle-prompts";

/**
 * Wire contract shared by the BattleRoom Durable Object and the browser.
 *
 * Type-only imports above are erased at build time (verbatimModuleSyntax),
 * so pulling `Op` in here does not drag React into the worker bundle.
 */

export type Seat = 0 | 1;
export type Verdict = Seat | -1;
export type Role = "player" | "spectator";

export type Phase =
	| "lobby"
	| "countdown"
	| "drawing"
	| "reveal"
	| "roundover"
	| "matchover";

export const SECONDS_CHOICES = [60, 90, 120] as const;
export const ROUNDS_CHOICES = [1, 3, 5] as const;
export const MAX_SPECTATORS = 40;
export const COUNTDOWN_MS = 3500;
export const VOTE_TIMEOUT_MS = 60_000;
export const ROOM_CODE_LENGTH = 5;

/** Guards against a client flooding the room with an unbounded drawing. */
export const MAX_OPS_PER_ENTRY = 3000;
export const MAX_POINTS_PER_STROKE = 3000;
export const MAX_PACKED_BYTES = 110_000;

/** Unambiguous alphabet — no O/0, I/1, S/5. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ23456789";

export function isValidRoomCode(code: string): boolean {
	if (code.length !== ROOM_CODE_LENGTH) return false;
	for (const ch of code) {
		if (!CODE_ALPHABET.includes(ch)) return false;
	}
	return true;
}

export function randomRoomCode(): string {
	const bytes = new Uint8Array(ROOM_CODE_LENGTH);
	crypto.getRandomValues(bytes);
	let out = "";
	for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
		out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * Compact drawing codec
 *
 * `{"x":123.456,"y":789.012,"p":0.83}` is ~40 bytes a point. Packed as
 * flat integer triples it is ~10, which keeps a dense 90-second drawing
 * inside both the WebSocket frame budget and the 128 KiB Durable Object
 * value limit.
 * ------------------------------------------------------------------ */

const TOOLS: BrushTool[] = ["pen", "marker", "pencil", "eraser"];

/** [0, toolIndex, color, size, [x,y,p, x,y,p, ...]] */
export type PackedStroke = [0, number, string, number, number[]];
/** [1, color, x, y] */
export type PackedFill = [1, string, number, number];
export type PackedOp = PackedStroke | PackedFill;

export function packOps(ops: Op[]): PackedOp[] {
	return ops.map((op): PackedOp => {
		if (op.kind === "fill") {
			return [1, op.color, Math.round(op.x), Math.round(op.y)];
		}
		const flat: number[] = [];
		for (const pt of op.pts) {
			flat.push(Math.round(pt.x), Math.round(pt.y), Math.round(pt.p * 100));
		}
		return [0, Math.max(0, TOOLS.indexOf(op.tool)), op.color, Math.round(op.size), flat];
	});
}

export function unpackOps(packed: PackedOp[]): Op[] {
	const out: Op[] = [];
	for (const p of packed) {
		if (p[0] === 1) {
			out.push({ kind: "fill", color: p[1], x: p[2], y: p[3] });
			continue;
		}
		const flat = p[4];
		const pts = [];
		for (let i = 0; i + 2 < flat.length; i += 3) {
			pts.push({ x: flat[i], y: flat[i + 1], p: flat[i + 2] / 100 });
		}
		out.push({ kind: "stroke", tool: TOOLS[p[1]] ?? "pen", color: p[2], size: p[3], pts });
	}
	return out;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validates untrusted packed drawing data. Everything here arrives from a
 * player's browser and gets rendered on every other client in the room, so
 * it is checked structurally rather than trusted.
 */
export function isValidPackedOp(value: unknown): value is PackedOp {
	if (!Array.isArray(value)) return false;

	if (value[0] === 1) {
		return (
			value.length === 4 &&
			typeof value[1] === "string" &&
			HEX.test(value[1]) &&
			Number.isFinite(value[2]) &&
			Number.isFinite(value[3])
		);
	}

	if (value[0] !== 0) return false;
	if (value.length !== 5) return false;
	if (!Number.isInteger(value[1]) || value[1] < 0 || value[1] >= TOOLS.length) return false;
	if (typeof value[2] !== "string" || !HEX.test(value[2])) return false;
	if (!Number.isFinite(value[3]) || value[3] <= 0 || value[3] > 256) return false;
	if (!Array.isArray(value[4])) return false;
	if (value[4].length > MAX_POINTS_PER_STROKE * 3) return false;
	if (value[4].length % 3 !== 0) return false;
	for (const n of value[4]) {
		if (!Number.isFinite(n) || n < -10_000 || n > 10_000) return false;
	}
	return true;
}

export function isValidPackedEntry(value: unknown): value is PackedOp[] {
	if (!Array.isArray(value)) return false;
	if (value.length > MAX_OPS_PER_ENTRY) return false;
	return value.every(isValidPackedOp);
}

/* ------------------------------------------------------------------ *
 * Room state
 * ------------------------------------------------------------------ */

export interface PublicPlayer {
	seat: Seat;
	name: string;
	connected: boolean;
	ready: boolean;
	submitted: boolean;
}

export interface RoomSettings {
	seconds: number;
	rounds: number;
	categories: PromptCategory[];
}

export interface RoomState {
	code: string;
	phase: Phase;
	round: number;
	settings: RoomSettings;
	players: (PublicPlayer | null)[];
	spectators: number;
	scores: [number, number];
	hostSeat: Seat | null;
	/** Withheld until the countdown ends, so nobody gets a head start. */
	prompt: string | null;
	/** Epoch ms deadline for the current phase, server-authoritative. */
	endsAt: number | null;
	/** Server clock, so a client with a skewed clock still shows the right timer. */
	serverNow: number;
	entries: [PackedOp[], PackedOp[]] | null;
	votes: {
		/** Counts for seat 0, seat 1, tie. */
		spectatorTally: [number, number, number];
		playerVotes: (Verdict | null)[];
		/** Whether the viewer receiving this state has already voted. */
		youVoted: Verdict | null;
	};
	roundWinner: Verdict | null;
	matchWinner: Verdict | null;
	log: { round: number; prompt: string; winner: Verdict }[];
}

export type ClientMsg =
	| { t: "setName"; name: string }
	| { t: "setSettings"; settings: Partial<RoomSettings> }
	| { t: "ready"; value: boolean }
	| { t: "start" }
	| { t: "stroke"; op: PackedOp }
	/**
	 * `final` distinguishes the player pressing "I'm done" from the client
	 * auto-saving just before the deadline. Only a final submit counts as
	 * finished, so two auto-saves cannot end the round early.
	 */
	| { t: "submit"; ops: PackedOp[]; final?: boolean }
	| { t: "vote"; winner: Verdict }
	| { t: "next" }
	| { t: "rematch" };

export type ServerMsg =
	| { t: "welcome"; you: { role: Role; seat: Seat | null }; state: RoomState }
	| { t: "state"; state: RoomState }
	/** Live strokes, relayed to spectators only — never to the opponent. */
	| { t: "peerStroke"; seat: Seat; op: PackedOp }
	| { t: "error"; message: string };
