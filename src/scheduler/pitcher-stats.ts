import type { PitchEvent } from '../server/socket-events.ts';
import type { AllPlay, LiveCurrentPlay } from './game-feed-types.ts';
import { mapPitchEvent } from './pitch-mapper.ts';

export interface PitchTypeUsage {
  /** Statcast pitch type code, e.g. 'FF', 'SL', 'CH'. */
  typeCode: string;
  typeName: string;
  count: number;
  /** Usage percentage 0–100, rounded to the nearest integer. */
  pct: number;
}

export interface PitcherGameStats {
  pitchesThrown: number;
  /**
   * Strike-side pitches: called strikes, swinging strikes, fouls, and balls put
   * in play. Matches the broadcast "Pitches-Strikes" convention where
   * `strikes + balls = pitchesThrown` always holds.
   */
  strikes: number;
  balls: number;
  /** Per-type breakdown, sorted descending by count. */
  usage: PitchTypeUsage[];
}

export const ZERO_PITCHER_STATS: PitcherGameStats = {
  pitchesThrown: 0,
  strikes: 0,
  balls: 0,
  usage: [],
};

/** Merges enrichment-base stats with current at-bat pitches. Returns a new object — does not mutate. */
export function mergePitcherStats(
  enrichment: PitcherGameStats,
  currentAtBatPitches: PitchEvent[]
): PitcherGameStats {
  if (currentAtBatPitches.length === 0) return enrichment;

  const pitchesThrown = enrichment.pitchesThrown + currentAtBatPitches.length;
  const strikes =
    enrichment.strikes +
    currentAtBatPitches.filter((p) => p.isStrike || p.isInPlay).length;
  const balls =
    enrichment.balls + currentAtBatPitches.filter((p) => p.isBall).length;

  // Build usage map seeded from enrichment
  const usageMap = new Map<string, { typeName: string; count: number }>();
  for (const u of enrichment.usage) {
    usageMap.set(u.typeCode, { typeName: u.typeName, count: u.count });
  }
  for (const p of currentAtBatPitches) {
    const code = p.pitchTypeCode ?? 'UN';
    const existing = usageMap.get(code);
    if (existing !== undefined) {
      existing.count++;
    } else {
      usageMap.set(code, { typeName: p.pitchType, count: 1 });
    }
  }

  const usage: PitchTypeUsage[] = [];
  for (const [typeCode, { typeName, count }] of usageMap) {
    usage.push({
      typeCode,
      typeName,
      count,
      pct: pitchesThrown > 0 ? Math.round((count / pitchesThrown) * 100) : 0,
    });
  }
  usage.sort((a, b) => b.count - a.count);

  return { pitchesThrown, strikes, balls, usage };
}

// ---------------------------------------------------------------------------
// computePitcherStats
// ---------------------------------------------------------------------------

export interface PitcherStatsResult {
  stats: PitcherGameStats;
  pitchHistory: PitchEvent[];
}

/**
 * Computes full-game pitcher stats from the cumulative `allPlays` array and
 * the in-progress `currentPlay`. Pure function — no side effects, no caching.
 *
 * Stats are recomputed from scratch each tick so there is no cold-start gap
 * when the server starts mid-game.
 *
 * @param pitcherId   ID of the pitcher whose stats to compute.
 * @param allPlays    All completed plate appearances from feed/live (cumulative).
 * @param currentPlay The in-progress at-bat, if any.
 */
export function computePitcherStats(
  pitcherId: number,
  allPlays: AllPlay[],
  currentPlay: LiveCurrentPlay | null
): PitcherStatsResult {
  const pitchHistory: PitchEvent[] = [];

  // Collect all pitch events from completed plays for this pitcher.
  for (const play of allPlays) {
    if (play.matchup.pitcher.id !== pitcherId) continue;
    for (const event of play.playEvents) {
      if (event.type === 'pitch') {
        pitchHistory.push(mapPitchEvent(event));
      }
    }
  }

  // Include in-progress at-bat pitches if the current play belongs to this pitcher
  // and the at-bat is not yet complete (to avoid double-counting once it finalises
  // and the play appears in allPlays on the next tick).
  if (
    currentPlay !== null &&
    !currentPlay.about.isComplete &&
    currentPlay.matchup.pitcher.id === pitcherId
  ) {
    for (const event of currentPlay.playEvents) {
      if (event.type === 'pitch') {
        pitchHistory.push(mapPitchEvent(event));
      }
    }
  }

  // Compute aggregate stats from the assembled pitch history.
  const pitchesThrown = pitchHistory.length;
  if (pitchesThrown === 0) {
    return { stats: ZERO_PITCHER_STATS, pitchHistory: [] };
  }

  let strikes = 0;
  let balls = 0;
  const usageMap = new Map<string, { typeName: string; count: number }>();

  for (const p of pitchHistory) {
    if (p.isStrike || p.isInPlay) strikes++;
    else if (p.isBall) balls++;

    const code = p.pitchTypeCode ?? 'UN';
    const existing = usageMap.get(code);
    if (existing !== undefined) {
      existing.count++;
    } else {
      usageMap.set(code, { typeName: p.pitchType, count: 1 });
    }
  }

  const usage: PitchTypeUsage[] = [];
  for (const [typeCode, { typeName, count }] of usageMap) {
    usage.push({
      typeCode,
      typeName,
      count,
      pct: Math.round((count / pitchesThrown) * 100),
    });
  }
  usage.sort((a, b) => b.count - a.count);

  return { stats: { pitchesThrown, strikes, balls, usage }, pitchHistory };
}
