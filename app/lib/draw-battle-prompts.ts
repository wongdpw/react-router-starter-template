export type PromptCategory = "objects" | "creatures" | "scenes" | "concepts";

export const CATEGORY_LABELS: Record<PromptCategory, string> = {
	objects: "Objects",
	creatures: "Creatures",
	scenes: "Scenes",
	concepts: "Concepts",
};

const PROMPTS: Record<PromptCategory, string[]> = {
	objects: [
		"lighthouse",
		"typewriter",
		"hot air balloon",
		"grand piano",
		"vending machine",
		"pocket watch",
		"sewing machine",
		"lava lamp",
		"telescope",
		"jukebox",
		"chandelier",
		"skateboard",
		"gramophone",
		"birdcage",
		"treehouse",
		"pinball machine",
		"suit of armor",
		"snow globe",
		"carousel horse",
		"espresso machine",
		"fire hydrant",
		"grandfather clock",
		"paper lantern",
		"ferris wheel",
		"submarine",
	],
	creatures: [
		"octopus",
		"axolotl",
		"pangolin",
		"seahorse",
		"narwhal",
		"chameleon",
		"hummingbird",
		"jellyfish",
		"praying mantis",
		"red panda",
		"hermit crab",
		"peacock",
		"sloth wearing glasses",
		"dragon hatchling",
		"griffin",
		"deep sea anglerfish",
		"a cat that just knocked something over",
		"mushroom with a face",
		"snail with a city on its shell",
		"three raccoons in a trench coat",
		"phoenix",
		"walrus",
		"stag beetle",
		"kraken",
		"bat hanging upside down",
	],
	scenes: [
		"a diner at 3am",
		"the last train home",
		"a rooftop garden",
		"tide pool at low tide",
		"a rainy bus stop",
		"campfire under stars",
		"abandoned amusement park",
		"a crowded elevator",
		"library after closing",
		"a street market at dusk",
		"laundromat on a Sunday",
		"the view from a treehouse",
		"a lighthouse in a storm",
		"backstage before a show",
		"a picnic gone wrong",
		"first snow in the city",
		"a garage band practicing",
		"desert highway at noon",
		"the bottom of a swimming pool",
		"a greenhouse in winter",
	],
	concepts: [
		"stage fright",
		"the smell of rain",
		"deja vu",
		"running late",
		"an awkward silence",
		"too much coffee",
		"gravity failing",
		"the moment before a sneeze",
		"a plan falling apart",
		"nostalgia",
		"stuck in a loop",
		"the underdog",
		"an unread message",
		"overpacked suitcase",
		"the wrong turn",
		"burnout",
		"beginner's luck",
		"a secret kept too long",
		"escape velocity",
		"the calm before",
	],
};

/**
 * Returns a shuffled deck of prompts drawn from the selected categories, so a
 * match never repeats a word until the whole deck has been used.
 */
export function buildDeck(categories: PromptCategory[]): string[] {
	const picked = categories.length > 0 ? categories : (Object.keys(PROMPTS) as PromptCategory[]);
	const deck = picked.flatMap((category) => PROMPTS[category]);

	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}

	return deck;
}
