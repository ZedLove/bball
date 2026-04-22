import type { AllPlay } from './game-feed-types.ts';
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
 * Iterates `allPlays` and accumulates pitch counts for the given pitcher.
 * Only processes plays where `matchup.pitcher.id === pitcherId` and events
 * where `type === 'pitch'`.
 */
export function computePitcherStats(
  allPlays: AllPlay[],
  pitcherId: number
): PitcherGameStats {
  let pitchesThrown = 0;
  let strikes = 0;
  let balls = 0;
  const typeMap = new Map<string, { typeName: string; count: number }>();

  for (const play of allPlays) {
    if (play.matchup.pitcher.id !== pitcherId) continue;
    for (const event of play.playEvents) {
      if (event.type !== 'pitch') continue;
      pitchesThrown++;
      if (event.details.isStrike === true) strikes++;
      if (event.details.isBall === true) balls++;
      const typeCode = event.details.type?.code ?? 'UN';
      const typeName = event.details.type?.description ?? 'Unknown';
      const existing = typeMap.get(typeCode);
      if (existing !== undefined) {
        existing.count++;
      } else {
        typeMap.set(typeCode, { typeName, count: 1 });
      }
    }
  }

  const usage: PitchTypeUsage[] = [];
  for (const [typeCode, { typeName, count }] of typeMap) {
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
