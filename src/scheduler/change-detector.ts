import type { Linescore } from './schedule-client.ts';

/**
 * Determines whether the linescore has changed between poll ticks.
 *
 * Called by the scheduler on each tick to decide whether to fetch
 * live-feed enrichment data.  Any detectable delta — score change,
 * inning advancement, outs change, or batter ID change — triggers
 * enrichment because the full snapshot is compared.
 *
 * Returns `false` when `previous` is `null` (first tick for a new
 * `gamePk`), which intentionally skips enrichment on bootstrap.
 *
 * This is a pure function with no internal state.  The caller
 * (`EnrichmentState`) stores `lastLinescoreSnapshot` and passes
 * it in on each tick, making the comparison independently testable.
 */
export function hasLinescoreDelta(
  current: Linescore,
  previous: Linescore | null,
): boolean {
  if (previous === null) return false;
  return JSON.stringify(current) !== JSON.stringify(previous);
}
