import type { PackedOp } from "./drawing-codec";

/**
 * Wire contract for Doodle Board rooms.
 *
 * There is no score, no vote and no winner here — the room only decides whose
 * turn it is and how long they get. What comes out the other end is a single
 * picture everybody worked on.
 */

export type DoodlePhase = "lobby" | "drawing" | "finished";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export const TURN_SECONDS_CHOICES = [30, 45, 60] as const;
export const PASS_CHOICES = [2, 3, 5] as const;

export const MAX_CHAT = 60;
export const MAX_CHAT_LEN = 120;
/** A whole session's worth of contributions on one canvas. */
export const MAX_CANVAS_OPS = 4000;

export interface DoodleSettings {
	seconds: number;
	/** How many times the turn order goes around before it's finished. */
	passes: number;
}

export interface DoodlePlayer {
	id: string;
	name: string;
	connected: boolean;
	/** Ops this player has contributed to the picture. */
	contributions: number;
}

export type DoodleChatKind = "chat" | "system" | "join" | "leave";

export interface DoodleChatEntry {
	id: string;
	kind: DoodleChatKind;
	from?: string;
	text: string;
	at: number;
}

export interface DoodleState {
	code: string;
	phase: DoodlePhase;
	settings: DoodleSettings;
	players: DoodlePlayer[];
	hostId: string | null;

	/** Whose turn it is right now. */
	activeId: string | null;
	/** Turn order for the session. */
	order: string[];
	pass: number;

	endsAt: number | null;
	serverNow: number;
	/** How full the picture is, for a gentle "running out of room" hint. */
	opCount: number;
}

export type DoodleClientMsg =
	| { t: "setName"; name: string }
	| { t: "setSettings"; settings: Partial<DoodleSettings> }
	| { t: "start" }
	/** One stroke, fill or icon, added to the shared picture. */
	| { t: "op"; op: PackedOp }
	| { t: "done" }
	| { t: "finish" }
	| { t: "chat"; text: string }
	| { t: "playAgain" };

export type DoodleServerMsg =
	| {
			t: "welcome";
			you: { id: string };
			state: DoodleState;
			/** The picture so far, so a late joiner sees everything. */
			canvas: PackedOp[];
			chat: DoodleChatEntry[];
	  }
	| { t: "state"; state: DoodleState }
	/** Relayed to everyone except the person who drew it. */
	| { t: "op"; op: PackedOp }
	| { t: "canvas"; canvas: PackedOp[] }
	| { t: "chat"; entry: DoodleChatEntry }
	| { t: "error"; message: string };
