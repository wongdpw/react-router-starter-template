/**
 * Bug Blaster online — protocol shared by the room DO and the client.
 *
 * Same shape as galaxy-protocol: the room is a relay, not a referee. The
 * host's browser runs the one true simulation, the guest sends inputs up
 * and renders snapshots back, so the DO stays tiny and the game code lives
 * in one place.
 */

export { ROOM_CODE_LENGTH, isValidRoomCode, randomRoomCode } from "./room-code";

export const BLASTER_MAX_PLAYERS = 2;

/** ~20 snapshots/sec from the host is plenty for a co-op shooter. */
export const SNAP_EVERY_FRAMES = 3;

export interface BlasterSeat {
	pid: string;
	name: string;
	connected: boolean;
}

export type BlasterPhase = "lobby" | "play" | "over";

export interface BlasterRoomState {
	code: string;
	phase: BlasterPhase;
	seats: BlasterSeat[]; // seat 0 = host = player 1
	youSeat: number; // 0 or 1, -1 while unseated
}

/**
 * Guest → room → host: the guest's current key state. Bug Blaster moves in
 * all four directions inside the player zone, so this carries more than the
 * Galaxy Swarm equivalent.
 */
export interface BlasterInput {
	t: "input";
	l: boolean; // left held
	r: boolean; // right held
	u: boolean; // up held
	d: boolean; // down held
	f: boolean; // fire held
}

/**
 * Host → room → guest: one compact world snapshot. Positions are rounded
 * ints; the mushroom field only ships what drawing needs.
 */
export interface BlasterSnap {
	t: "snap";
	n: number; // sequence
	w: number; // wave
	s: [number, number]; // scores p1, p2
	v: [number, number]; // lives p1, p2
	/** players: [x, y] in pixels */
	p: [[number, number], [number, number]];
	i: [boolean, boolean]; // invulnerable-flicker flags
	/** mushrooms: [col, row, hp] */
	m: [number, number, number][];
	/** chain segments: [col, row, isHead?1:0] */
	c: [number, number, number][];
	/** player bullets per player: [x, y] */
	b: [[number, number][], [number, number][]];
}

export type BlasterClientMsg =
	| { t: "start" } // host, from lobby or over
	| BlasterInput // guest
	| BlasterSnap // host
	| { t: "over"; s: [number, number] }; // host

export type BlasterServerMsg =
	| { t: "room"; state: BlasterRoomState }
	| { t: "begin" } // both players seated and host pressed start
	| BlasterInput // relayed to host
	| BlasterSnap // relayed to guest
	| { t: "ended"; s: [number, number] }
	| { t: "peerGone" }
	| { t: "error"; message: string };
