/**
 * Galaxy Swarm online — protocol shared by the room DO and the client.
 *
 * The room is a relay, not a referee: the host's browser runs the one true
 * simulation, the guest sends inputs up and renders snapshots back. That
 * keeps the DO tiny and means the game code stays in one place.
 */

export { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "./room-code";

export const GALAXY_MAX_PLAYERS = 2;

/** ~20 snapshots/sec from the host is plenty for a co-op shooter. */
export const SNAP_EVERY_FRAMES = 3;

export interface GalaxySeat {
	pid: string;
	name: string;
	connected: boolean;
}

export type GalaxyPhase = "lobby" | "play" | "over";

export interface GalaxyRoomState {
	code: string;
	phase: GalaxyPhase;
	seats: GalaxySeat[]; // seat 0 = host = player 1
	youSeat: number; // 0 or 1, -1 while unseated
}

/** Guest → room → host: the guest's current key state. */
export interface GalaxyInput {
	t: "input";
	l: boolean; // left held
	r: boolean; // right held
	f: boolean; // fire held
}

/**
 * Host → room → guest: one compact world snapshot. Positions are rounded
 * ints; enemies carry only what drawing needs.
 */
export interface GalaxySnap {
	t: "snap";
	n: number; // sequence
	w: number; // wave
	s: [number, number]; // scores p1, p2
	v: [number, number]; // lives p1, p2
	p: [number, number]; // player x p1, p2
	i: [boolean, boolean]; // invulnerable-flicker flags
	/** alive enemies: [x, y, row, diving?1:0] */
	e: [number, number, number, number][];
	/** player bullets per player: [x, y] */
	b: [[number, number][], [number, number][]];
	/** enemy bullets: [x, y] */
	eb: [number, number][];
}

export type GalaxyClientMsg =
	| { t: "start" } // host, from lobby or over
	| GalaxyInput // guest
	| GalaxySnap // host
	| { t: "over"; s: [number, number] }; // host

export type GalaxyServerMsg =
	| { t: "room"; state: GalaxyRoomState }
	| { t: "begin" } // both players seated and host pressed start
	| GalaxyInput // relayed to host
	| GalaxySnap // relayed to guest
	| { t: "ended"; s: [number, number] }
	| { t: "peerGone" }
	| { t: "error"; message: string };
