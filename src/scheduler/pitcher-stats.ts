import type { PitchEvent } from '../server/socket-events.ts';

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
