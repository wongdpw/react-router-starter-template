export const ROOM_CODE_LENGTH = 5;

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
