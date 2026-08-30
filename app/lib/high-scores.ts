/**
 * Arcade high-score tables — one top-10 board per game.
 *
 * Shared by the client, the API route and the Durable Object so the shape
 * of an entry is defined in exactly one place. Initials arrive from the
 * browser, so they are normalised here and re-checked on the server.
 */

import { isGameId, type GameId } from "./game-ids";

export const HIGH_SCORE_SLOTS = 10;
export const INITIALS_LENGTH = 3;

export interface ScoreEntry {
	/** Exactly three characters, A–Z or 0–9. */
	who: string;
	score: number;
	/** Epoch ms, used only to break ties in favour of whoever got there first. */
	at: number;
}

export type ScoreBoard = ScoreEntry[];

/** Force anything the player typed into classic arcade initials. */
export function normalizeInitials(raw: string): string {
	const cleaned = (raw ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, INITIALS_LENGTH);
	return cleaned.padEnd(INITIALS_LENGTH, "A");
}

export function isValidInitials(raw: unknown): raw is string {
	return typeof raw === "string" && /^[A-Z0-9]{3}$/.test(raw);
}

/** Highest first; an older entry wins a tie, the way a real cabinet behaves. */
export function sortBoard(board: ScoreBoard): ScoreBoard {
	return [...board].sort((a, b) => (b.score - a.score) || (a.at - b.at));
}

/** True when this score earns a place on the board. */
export function madeTheBoard(board: ScoreBoard, score: number): boolean {
	if (score <= 0) return false;
	if (board.length < HIGH_SCORE_SLOTS) return true;
	return score > sortBoard(board)[HIGH_SCORE_SLOTS - 1].score;
}

/** Insert and trim to the top ten. */
export function withScore(board: ScoreBoard, entry: ScoreEntry): ScoreBoard {
	return sortBoard([...board, entry]).slice(0, HIGH_SCORE_SLOTS);
}

export function isScoreGameId(value: unknown): value is GameId {
	return isGameId(value);
}
