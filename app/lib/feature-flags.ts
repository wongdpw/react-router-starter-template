/**
 * Switches for work that is merged but not ready for players yet.
 *
 * Flipping one of these to `true` is the only change needed to release the
 * feature — the route, loader and action all stay wired up, so nothing has to
 * be rebuilt or re-tested when it goes live.
 */

/** Daily Prompt: built and tested, held back while the details are settled. */
export const DAILY_PROMPT_ENABLED = false;
