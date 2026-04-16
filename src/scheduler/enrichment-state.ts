import type { Linescore } from './poller.ts';

/**
 * Per-game enrichment cursor state owned by the scheduler.
 *
 * Created on the first tick for a new `gamePk`, held as
 * `EnrichmentState | null` at the scheduler level.
 *
 * Set to `null` when:
 * - the active `gamePk` changes
 * - the game drops out of scope (no game found in the schedule response)
 * - final-game enrichment completes and `game-summary` has been emitted
 */
export interface EnrichmentState {
  gamePk: number;
  /**
   * Cursor for the next `diffPatch` call.  Format: `YYYYMMDD_HHmmss` UTC.
   *
   * Seeded from the game's `gameDate` on the first tick (enrichment is
   * skipped that tick).  Updated to `metaData.timeStamp` from the live-feed
   * response after each successful enrichment fetch.
   */
  lastTimestamp: string;
  /**
   * Highest `atBatIndex` of a completed play already emitted to clients.
   * Initialised to `-1` so the first real enrichment fetch processes all
   * available plays since `lastTimestamp`.
   */
  lastProcessedAtBatIndex: number;
  /**
   * Linescore snapshot captured at the end of the previous schedule poll.
   * Passed to `change-detector` to decide whether enrichment should run.
   *
   * `null` on the first tick — enrichment is unconditionally skipped that
   * tick, avoiding a spurious full-game replay on bootstrap.
   */
  lastLinescoreSnapshot: Linescore | null;
}

/**
 * Creates a fresh `EnrichmentState` for a newly observed game.
 *
 * Enrichment is intentionally skipped on the first tick after creation
 * (indicated by `lastLinescoreSnapshot: null`).  The scheduler stores   * this state and begins enrichment from the second tick onward.
 *
 * @param gamePk        MLB game identifier.
 * @param seedTimestamp Game start time in `YYYYMMDD_HHmmss` UTC format,
 *                      derived from the schedule response `gameDate`.
 *                      Used as the initial `startTimecode` for the first
 *                      `diffPatch` call.
 */
export function createEnrichmentState(gamePk: number, seedTimestamp: string): EnrichmentState {
  return {
    gamePk,
    lastTimestamp: seedTimestamp,
    lastProcessedAtBatIndex: -1,
    lastLinescoreSnapshot: null,
  };
}
