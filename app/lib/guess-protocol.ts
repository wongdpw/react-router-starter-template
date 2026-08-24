import type { PackedOp } from "./drawing-codec";
import type { GuessDifficulty } from "./guess-words";

/** Wire contract for Guess the Drawing rooms. */

export type GuessPhase = "lobby" | "choosing" | "drawing" | "turnend" | "gameover";

export const ROUND_CHOICES = [1, 2, 3] as const;
export const DRAW_SECONDS_CHOICES = [60, 80, 100] as const;

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const CHOOSE_MS = 12_000;
export const TURN_GAP_MS = 6_000;
export const WORD_CHOICES = 3;
export const MAX_CHAT = 60;
export const MAX_CHAT_LEN = 120;

/** Points a correct guesser can earn, before the speed component. */
export const BASE_GUESS_POINTS = 100;
export const SPEED_GUESS_POINTS = 400;
export const FIRST_CORRECT_BONUS = 50;
export const DRAWER_POINTS_PER_GUESSER = 40;

export interface GuessSettings {
	rounds: number;
	seconds: number;
	difficulty: GuessDifficulty;
}

export interface GuessPlayer {
	/** Public id. Never the private pid, which would let someone steal a seat. */
	id: string;
	name: string;
	connected: boolean;
	ready: boolean;
	score: number;
	/** Has this player already guessed correctly this turn. */
	guessed: boolean;
	/** Points earned in the turn just finished, for the summary. */
	lastDelta: number;
}

export type ChatKind = "chat" | "system" | "correct" | "close" | "join" | "leave";

export interface ChatEntry {
	id: string;
	kind: ChatKind;
	/** Display name of the sender; absent for system lines. */
	from?: string;
	text: string;
	at: number;
}

export interface GuessState {
	code: string;
	phase: GuessPhase;
	settings: GuessSettings;
	players: GuessPlayer[];
	hostId: string | null;
	drawerId: string | null;

	round: number;
	/** 1-based position in the whole game, e.g. turn 5 of 12. */
	turnNumber: number;
	totalTurns: number;

	/** Epoch ms deadline for the current phase. */
	endsAt: number | null;
	/** Server clock, so a skewed client still renders the right countdown. */
	serverNow: number;

	/** Masked form, e.g. "l _ _ _ t h o _ s e". Everyone sees this. */
	wordHint: string | null;
	/** Only populated for viewers allowed to know: the drawer, players who
	 *  have already guessed it, and everyone once the turn is over. */
	word: string | null;
	/** Only sent to the drawer during the choosing phase. */
	choices: string[] | null;

	youAreDrawer: boolean;
	youGuessed: boolean;
	correctCount: number;
	/** Number of players eligible to guess this turn. */
	guesserCount: number;
}

export type GuessClientMsg =
	| { t: "setName"; name: string }
	| { t: "setSettings"; settings: Partial<GuessSettings> }
	| { t: "ready"; value: boolean }
	| { t: "start" }
	| { t: "choose"; index: number }
	| { t: "stroke"; op: PackedOp }
	/** Full canvas resend, used after the drawer undoes or clears. */
	| { t: "sync"; ops: PackedOp[] }
	| { t: "chat"; text: string }
	| { t: "skip" }
	| { t: "playAgain" };

export type GuessServerMsg =
	| { t: "welcome"; you: { id: string }; state: GuessState; chat: ChatEntry[] }
	| { t: "state"; state: GuessState }
	/** Live stroke from the drawer, relayed to everyone else. */
	| { t: "stroke"; op: PackedOp }
	| { t: "sync"; ops: PackedOp[] }
	| { t: "chat"; entry: ChatEntry }
	| { t: "error"; message: string };
