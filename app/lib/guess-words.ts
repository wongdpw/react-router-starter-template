export type GuessDifficulty = "easy" | "normal" | "hard" | "mixed";

export const DIFFICULTY_LABELS: Record<GuessDifficulty, string> = {
	easy: "Easy",
	normal: "Normal",
	hard: "Hard",
	mixed: "Mixed",
};

/**
 * Words for Guess the Drawing.
 *
 * Unlike the Draw Battle prompts, every entry here has to be *guessable* from
 * a drawing — concrete nouns only, no abstract concepts, and nothing so
 * obscure that a correct drawing still can't be named.
 */
const WORDS: Record<Exclude<GuessDifficulty, "mixed">, string[]> = {
	easy: [
		"cat", "dog", "house", "tree", "sun", "moon", "star", "fish", "boat", "car",
		"apple", "banana", "hat", "shoe", "book", "clock", "key", "door", "chair", "table",
		"cup", "spoon", "pizza", "cake", "balloon", "kite", "ball", "bike", "train", "plane",
		"bird", "snake", "bee", "frog", "duck", "cow", "pig", "horse", "sheep", "mouse",
		"flower", "cloud", "rain", "snowman", "ghost", "robot", "crown", "heart", "eye", "hand",
	],
	normal: [
		"lighthouse", "octopus", "cactus", "guitar", "camera", "umbrella", "backpack", "telescope",
		"volcano", "windmill", "castle", "bridge", "anchor", "compass", "hourglass", "lantern",
		"penguin", "elephant", "giraffe", "dolphin", "butterfly", "spider", "crab", "owl",
		"dragon", "mermaid", "wizard", "pirate", "skeleton", "scarecrow", "campfire", "tent",
		"microphone", "headphones", "skateboard", "surfboard", "parachute", "helicopter", "submarine", "rocket",
		"toaster", "blender", "mailbox", "fire hydrant", "traffic light", "windmill", "treehouse", "birdcage",
		"cupcake", "popcorn", "sushi", "hamburger", "ice cream", "watermelon", "pineapple", "mushroom",
	],
	hard: [
		"chandelier", "typewriter", "gramophone", "kaleidoscope", "metronome", "sundial",
		"pangolin", "axolotl", "narwhal", "seahorse", "chameleon", "praying mantis",
		"stethoscope", "accordion", "harmonica", "xylophone", "unicycle", "hot air balloon",
		"ferris wheel", "carousel", "pinball machine", "vending machine", "escalator", "periscope",
		"lawn mower", "wheelbarrow", "watering can", "birdhouse", "weather vane", "grandfather clock",
		"suit of armor", "treasure chest", "message in a bottle", "shooting star", "solar eclipse",
		"jellyfish", "anglerfish", "hermit crab", "stag beetle", "hummingbird",
	],
};

const ALL = [...WORDS.easy, ...WORDS.normal, ...WORDS.hard];

function shuffle<T>(items: T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** A shuffled deck, so a game never repeats a word until the deck runs dry. */
export function buildWordDeck(difficulty: GuessDifficulty): string[] {
	const source = difficulty === "mixed" ? ALL : WORDS[difficulty];
	return shuffle(source);
}

/** Collapses case, punctuation and spacing so "Hot-Air Balloon" matches "hot air balloon". */
export function normalizeGuess(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Bounded edit distance — only needs to know "is this within 1 or 2 edits". */
export function editDistance(a: string, b: string, cap = 3): number {
	if (Math.abs(a.length - b.length) > cap) return cap + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const curr = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
			curr.push(value);
			if (value < rowMin) rowMin = value;
		}
		if (rowMin > cap) return cap + 1;
		prev = curr;
	}
	return prev[b.length];
}

/** Underscores for unrevealed letters; spaces and hyphens always show. */
export function maskWord(word: string, revealed: number[]): string {
	const set = new Set(revealed);
	return word
		.split("")
		.map((ch, i) => (ch === " " || ch === "-" ? ch : set.has(i) ? ch : "_"))
		.join("");
}

/** Indices of letters that can be revealed as hints. */
export function letterIndices(word: string): number[] {
	const out: number[] = [];
	for (let i = 0; i < word.length; i++) {
		if (word[i] !== " " && word[i] !== "-") out.push(i);
	}
	return out;
}
