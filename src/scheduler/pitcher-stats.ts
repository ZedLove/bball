import type { PitchEvent } from '../server/socket-events.ts';

export interface PitchTypeUsage {
  /** Statcast pitch type code, e.g. 'FF', 'SL', 'CH'. */
  typeCode: string;
  /** Human-readable pitch type name, e.g. 'Four-Seam Fastball'. */
  typeName: string;
  /** Number of pitches of this type thrown. */
  count: number;
  /** Usage percentage 0–100, rounded to the nearest integer. */
  pct: number;
}

export interface PitcherGameStats {
  /** Total pitches thrown. */
  pitchesThrown: number;
  /** Pitches that were called or swung as strikes (not necessarily strikeouts). */
  strikes: number;
  /** Pitches called as balls. */
  balls: number;
  /** Per-type usage breakdown, sorted descending by count. */
  usage: PitchTypeUsage[];
}

export const ZERO_PITCHER_STATS: PitcherGameStats = {
  pitchesThrown: 0,
  strikes: 0,
  balls: 0,
  usage: [],
};

/**
 * Merges an enrichment-base `PitcherGameStats` with pitches from the
 * current in-progress at-bat. Returns a new stats object — does not mutate.
 *
 * When `currentAtBatPitches` is empty, the enrichment stats are returned
 * unchanged.
 */
export function mergePitcherStats(
  enrichment: PitcherGameStats,
  currentAtBatPitches: PitchEvent[]
): PitcherGameStats {
  if (currentAtBatPitches.length === 0) return enrichment;

  const pitchesThrown = enrichment.pitchesThrown + currentAtBatPitches.length;
  const strikes =
    enrichment.strikes + currentAtBatPitches.filter((p) => p.isStrike).length;
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
