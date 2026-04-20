import type { Linescore } from './schedule-client.ts';

/**
 * The subset of linescore fields that signal a completed play or substitution.
 *
 * `balls` and `strikes` are intentionally excluded — they change on every
 * pitch and would cause enrichment to fire 5-7× per at-bat.  `inningState`,
 * `innings[]`, and the full `offense`/`defense` objects are also excluded
 * because they contain per-pitch or per-position noise.
 *
 * Fields included and what they detect:
 * - `outs`           — any out recorded (or outs reset at half-inning end)
 * - `currentInning`  — inning advancement
 * - `homeRuns`       — run scored by home team
 * - `awayRuns`       — run scored by away team
 * - `batterId`       — new batter = previous at-bat completed
 * - `pitcherId`      — pitching substitution
 */
interface LinescoreSignal {
  outs: number;
  currentInning: number;
  homeRuns: number;
  awayRuns: number;
  batterId: number | null;
  pitcherId: number | null;
}

function toSignal(ls: Linescore): LinescoreSignal {
  return {
    outs: ls.outs,
    currentInning: ls.currentInning,
    homeRuns: ls.teams.home.runs,
    awayRuns: ls.teams.away.runs,
    batterId: ls.offense?.batter?.id ?? null,
    pitcherId: ls.defense?.pitcher?.id ?? null,
  };
}

/**
 * Determines whether the linescore has changed in a way that signals a
 * completed play or substitution since the previous poll tick.
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
  previous: Linescore | null
): boolean {
  if (previous === null) return false;
  const curr = toSignal(current);
  const prev = toSignal(previous);
  return (
    curr.outs !== prev.outs ||
    curr.currentInning !== prev.currentInning ||
    curr.homeRuns !== prev.homeRuns ||
    curr.awayRuns !== prev.awayRuns ||
    curr.batterId !== prev.batterId ||
    curr.pitcherId !== prev.pitcherId
  );
}
