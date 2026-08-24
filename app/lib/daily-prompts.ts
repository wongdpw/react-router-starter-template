/**
 * The daily drawing prompt.
 *
 * The prompt is derived from the date rather than stored, so there is no cron
 * job, no database row, and no way for the schedule to drift: every visitor
 * on a given UTC day computes the same answer from the same pure function.
 */

const PROMPTS: string[] = [
	"a machine that makes weather",
	"your desk at 3am",
	"the last library on earth",
	"a creature that lives in static",
	"something you lost as a child",
	"a house that walks",
	"the inside of a music box",
	"a map to nowhere",
	"two robots in love",
	"a city built on a whale",
	"the smell of your grandmother's kitchen",
	"a plant that eats sound",
	"an astronaut's day off",
	"the door you never opened",
	"a storm in a teacup",
	"a bird made of paper",
	"the ocean floor at noon",
	"your favourite chair",
	"a lighthouse keeper's cat",
	"something breaking beautifully",
	"a train to the moon",
	"the last slice of cake",
	"an argument between two clouds",
	"a garden growing indoors",
	"the shape of a held breath",
	"a fox wearing your clothes",
	"a bridge that shouldn't hold",
	"the view from inside a bottle",
	"a clock that runs backwards",
	"somebody dancing badly",
	"a dragon who is very tired",
	"the corner shop at closing time",
	"a forest after the fire",
	"your hands, from memory",
	"a submarine full of flowers",
	"the neighbour you've never met",
	"a jellyfish parade",
	"something older than you",
	"a hotel for insects",
	"the moment before falling",
	"a kite that got away",
	"a room with too many doors",
	"an octopus doing paperwork",
	"a mountain that hums",
	"the first snow of the year",
	"a suitcase that won't close",
	"a whale in a swimming pool",
	"the back of a wardrobe",
	"a candle burning at both ends",
	"a fish that dreams of flying",
	"your street in a hundred years",
	"a spider's idea of a house",
	"a scarecrow off duty",
	"the wrong kind of moon",
	"a picnic underwater",
	"a wolf in the wrong story",
	"a phone booth in the desert",
	"something that hums when nobody's listening",
	"a staircase to the sea",
	"a beetle in armour",
	"the shape of an echo",
	"a greenhouse in winter",
	"a bear who runs a bakery",
	"the last day of summer",
	"a ship in a storm in a jar",
	"an angel with bad wings",
	"a chair nobody sits in",
	"a moth drawn to the wrong light",
	"the tide going out forever",
	"a carnival with no people",
];

/** Today's date in UTC, as YYYY-MM-DD. */
export function todayKey(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** The previous day's key, for showing yesterday's winner. */
export function previousKey(day: string): string {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

/** Whole days since the Unix epoch, in UTC. */
function dayNumber(day: string): number {
	return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/**
 * Walks the whole list before repeating anything.
 *
 * Hashing the date looked simpler but distributed badly — over a year some
 * prompts came up nine times and others once. A stride that is coprime with
 * the list length visits every prompt exactly once per cycle, in a scattered
 * order, so nothing repeats for PROMPTS.length days.
 */
const STRIDE = 29;

export function promptFor(day: string): string {
	const n = PROMPTS.length;
	const index = (((dayNumber(day) * STRIDE) % n) + n) % n;
	return PROMPTS[index];
}

export const PROMPT_COUNT = PROMPTS.length;

/** Milliseconds until the next UTC midnight, when the prompt rolls over. */
export function msUntilNextPrompt(now: Date = new Date()): number {
	const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
	return Math.max(0, next - now.getTime());
}

/** e.g. "Saturday 23 August" — display only, never used for scheduling. */
export function formatDay(day: string): string {
	const d = new Date(`${day}T00:00:00Z`);
	return d.toLocaleDateString("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		timeZone: "UTC",
	});
}
