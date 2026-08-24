/**
 * Words for Fake Artist.
 *
 * Every word ships with its category, because the category is what makes the
 * game work: the faker is told the category but not the word, which gives
 * them just enough to bluff a plausible first stroke.
 */
export interface FakeWord {
	category: string;
	word: string;
}

const BY_CATEGORY: Record<string, string[]> = {
	Animals: [
		"elephant", "penguin", "octopus", "giraffe", "hedgehog", "flamingo", "crocodile",
		"squirrel", "jellyfish", "peacock", "tortoise", "kangaroo", "walrus", "chameleon",
	],
	Food: [
		"pizza", "cupcake", "sushi", "hamburger", "watermelon", "spaghetti", "pineapple",
		"ice cream cone", "hot dog", "pretzel", "birthday cake", "taco", "popcorn", "doughnut",
	],
	"Around the house": [
		"toaster", "lamp", "bathtub", "umbrella", "teapot", "vacuum cleaner", "mirror",
		"bookshelf", "washing machine", "alarm clock", "houseplant", "sofa", "kettle", "birdcage",
	],
	Places: [
		"lighthouse", "castle", "beach", "airport", "library", "volcano", "windmill",
		"pyramid", "campsite", "treehouse", "igloo", "waterfall", "skyscraper", "barn",
	],
	Transport: [
		"bicycle", "helicopter", "submarine", "hot air balloon", "skateboard", "tractor",
		"rocket", "sailboat", "motorcycle", "train", "canoe", "ambulance", "scooter", "tank",
	],
	Sports: [
		"basketball", "surfing", "boxing", "archery", "skiing", "golf", "bowling",
		"tennis", "swimming", "skateboarding", "fishing", "cycling", "gymnastics", "hockey",
	],
	Fantasy: [
		"dragon", "wizard", "mermaid", "unicorn", "ghost", "vampire", "werewolf",
		"knight", "witch", "troll", "fairy", "genie", "phoenix", "giant",
	],
	Music: [
		"guitar", "drum kit", "piano", "trumpet", "violin", "microphone", "headphones",
		"accordion", "harp", "saxophone", "banjo", "tambourine", "jukebox", "record player",
	],
	Weather: [
		"thunderstorm", "rainbow", "tornado", "blizzard", "sunrise", "fog", "hailstorm",
		"heatwave", "lightning", "snowfall", "eclipse", "hurricane",
	],
	Jobs: [
		"chef", "firefighter", "astronaut", "doctor", "farmer", "pilot", "barber",
		"lifeguard", "detective", "clown", "scientist", "postman", "referee", "magician",
	],
};

export const CATEGORIES = Object.keys(BY_CATEGORY);

function shuffle<T>(items: T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** A shuffled deck across the chosen categories, or all of them. */
export function buildFakeDeck(categories: string[]): FakeWord[] {
	const picked = categories.filter((c) => BY_CATEGORY[c]);
	const source = picked.length > 0 ? picked : CATEGORIES;
	const deck: FakeWord[] = [];
	for (const category of source) {
		for (const word of BY_CATEGORY[category]) {
			deck.push({ category, word });
		}
	}
	return shuffle(deck);
}

/** Collapses case and punctuation so the faker's final guess is judged fairly. */
export function normalizeWord(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
