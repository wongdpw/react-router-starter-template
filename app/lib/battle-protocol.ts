import type { PackedOp } from "./drawing-codec";
import type { PromptCategory } from "./draw-battle-prompts";

/**
 * Wire contract for Draw Battle rooms, shared by the BattleRoom Durable
 * Object and the browser.
 *
 * The drawing codec and room-code helpers live in their own modules now
 * that a second game uses them; they are re-exported here so existing
 * Draw Battle imports keep working from one place.
 */

export {
	MAX_OPS_PER_ENTRY,
	MAX_PACKED_BYTES,
	MAX_POINTS_PER_STROKE,
	isValidPackedEntry,
	isValidPackedOp,
	packOps,
	unpackOps,
} from "./drawing-codec";
export type { PackedFill, PackedOp, PackedStroke } from "./drawing-codec";
export { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "./room-code";

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
