import { describe, it, expect } from 'vitest';
import {
  computePitcherStats,
  mergePitcherStats,
  ZERO_PITCHER_STATS,
} from './pitcher-stats.ts';
import type { AllPlay } from './game-feed-types.ts';
import type { PitchEvent } from '../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePlay(
  pitcherId: number,
  pitches: Array<{
    typeCode?: string;
    typeName?: string;
    isStrike?: boolean;
    isBall?: boolean;
  }> = []
): AllPlay {
  return {
    atBatIndex: 0,
    result: { eventType: 'strikeout', description: '', rbi: 0 },
    about: {
      atBatIndex: 0,
      halfInning: 'top',
      inning: 1,
      isComplete: true,
      isScoringPlay: false,
    },
    matchup: {
      batter: { id: 1, fullName: 'Test Batter' },
      pitcher: { id: pitcherId, fullName: 'Test Pitcher' },
    },
    playEvents: pitches.map((p, i) => ({
      type: 'pitch' as const,
      isPitch: true,
      pitchNumber: i + 1,
      details: {
        description: p.isStrike === true ? 'Called Strike' : 'Ball',
        type:
          p.typeCode !== undefined
            ? {
                code: p.typeCode,
                description: p.typeName ?? p.typeCode,
              }
            : undefined,
        isStrike: p.isStrike ?? false,
        isBall: p.isBall ?? false,
        isInPlay: false,
      },
    })),
  };
}

function makePitchEvent(overrides: Partial<PitchEvent> = {}): PitchEvent {
  return {
    pitchNumber: 1,
    pitchType: 'Four-Seam Fastball',
    pitchTypeCode: 'FF',
    call: 'Ball',
    isBall: true,
    isStrike: false,
    isInPlay: false,
    speedMph: 96,
    countAfter: { balls: 1, strikes: 0 },
    tracking: null,
    hitData: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computePitcherStats
// ---------------------------------------------------------------------------

describe('computePitcherStats', () => {
  it('returns zero stats for empty allPlays', () => {
    const stats = computePitcherStats([], 12345);
    expect(stats).toEqual(ZERO_PITCHER_STATS);
  });

  it('returns zero stats when no plays match the pitcher ID', () => {
    const plays = [makePlay(999, [{ typeCode: 'FF', isStrike: true }])];
    const stats = computePitcherStats(plays, 12345);
    expect(stats).toEqual(ZERO_PITCHER_STATS);
  });

  it('counts only pitches (not action/pickoff events) for the target pitcher', () => {
    const play = makePlay(1, [
      { typeCode: 'FF', isStrike: true },
      { typeCode: 'SL', isBall: true },
    ]);
    // Inject a non-pitch event to ensure it is ignored
    play.playEvents.unshift({
      type: 'action',
      details: {
        description: 'Pickoff Attempt',
        isStrike: false,
        isBall: false,
      },
    } as unknown as AllPlay['playEvents'][number]);

    const stats = computePitcherStats([play], 1);
    expect(stats.pitchesThrown).toBe(2);
  });

  it('counts pitches for the target pitcher and ignores other pitchers', () => {
    const plays = [
      makePlay(1, [
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'SL', isBall: true },
      ]),
      makePlay(2, [
        { typeCode: 'CH', isStrike: true },
        { typeCode: 'CH', isBall: true },
      ]),
    ];
    const stats = computePitcherStats(plays, 1);
    expect(stats.pitchesThrown).toBe(3);
    expect(stats.strikes).toBe(2);
    expect(stats.balls).toBe(1);
  });

  it('computes strike and ball counts correctly', () => {
    const plays = [
      makePlay(1, [
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'CU', isBall: true },
        { typeCode: 'FF', isBall: true },
      ]),
    ];
    const stats = computePitcherStats(plays, 1);
    expect(stats.pitchesThrown).toBe(4);
    expect(stats.strikes).toBe(2);
    expect(stats.balls).toBe(2);
  });

  it('computes usage percentages rounded to nearest integer', () => {
    // 2 FF out of 3 pitches = 66.6...% → 67%
    const plays = [
      makePlay(1, [
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'SL', isBall: true },
      ]),
    ];
    const stats = computePitcherStats(plays, 1);
    const ff = stats.usage.find((u) => u.typeCode === 'FF');
    const sl = stats.usage.find((u) => u.typeCode === 'SL');
    expect(ff?.pct).toBe(67);
    expect(sl?.pct).toBe(33);
  });

  it('sorts usage descending by count', () => {
    const plays = [
      makePlay(1, [
        { typeCode: 'SL', isBall: true },
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'FF', isStrike: true },
      ]),
    ];
    const stats = computePitcherStats(plays, 1);
    expect(stats.usage[0].typeCode).toBe('FF');
    expect(stats.usage[1].typeCode).toBe('SL');
  });

  it('handles pitches with no type classification (maps to UN)', () => {
    const play = makePlay(1, [{ isStrike: true }, { isBall: true }]);
    // Remove type from the raw events (simulates missing classification)
    for (const ev of play.playEvents) {
      delete ev.details.type;
    }
    const stats = computePitcherStats([play], 1);
    expect(stats.pitchesThrown).toBe(2);
    const unknown = stats.usage.find((u) => u.typeCode === 'UN');
    expect(unknown?.count).toBe(2);
  });

  it('accumulates pitches across multiple plays by the same pitcher', () => {
    const plays = [
      makePlay(1, [{ typeCode: 'FF', isStrike: true }]),
      makePlay(1, [
        { typeCode: 'FF', isStrike: true },
        { typeCode: 'SL', isBall: true },
      ]),
    ];
    const stats = computePitcherStats(plays, 1);
    expect(stats.pitchesThrown).toBe(3);
    const ff = stats.usage.find((u) => u.typeCode === 'FF');
    expect(ff?.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// mergePitcherStats
// ---------------------------------------------------------------------------

describe('mergePitcherStats', () => {
  it('returns enrichment stats unchanged when currentAtBatPitches is empty', () => {
    const enrichment = {
      pitchesThrown: 5,
      strikes: 3,
      balls: 2,
      usage: [{ typeCode: 'FF', typeName: 'Four-Seam', count: 5, pct: 100 }],
    };
    expect(mergePitcherStats(enrichment, [])).toBe(enrichment);
  });

  it('adds current at-bat pitches to total count', () => {
    const enrichment = {
      pitchesThrown: 5,
      strikes: 3,
      balls: 2,
      usage: [
        { typeCode: 'FF', typeName: 'Four-Seam Fastball', count: 5, pct: 100 },
      ],
    };
    const current = [
      makePitchEvent({ pitchTypeCode: 'FF', isStrike: true, isBall: false }),
      makePitchEvent({
        pitchTypeCode: 'SL',
        pitchType: 'Slider',
        isBall: true,
        isStrike: false,
      }),
    ];
    const merged = mergePitcherStats(enrichment, current);
    expect(merged.pitchesThrown).toBe(7);
    expect(merged.strikes).toBe(4);
    expect(merged.balls).toBe(3);
  });

  it('merges usage counts and recomputes percentages', () => {
    const enrichment = {
      pitchesThrown: 4,
      strikes: 2,
      balls: 2,
      usage: [
        { typeCode: 'FF', typeName: 'Four-Seam Fastball', count: 3, pct: 75 },
        { typeCode: 'SL', typeName: 'Slider', count: 1, pct: 25 },
      ],
    };
    const current = [
      makePitchEvent({ pitchTypeCode: 'FF', isStrike: true }),
      makePitchEvent({
        pitchTypeCode: 'CH',
        pitchType: 'Changeup',
        isBall: true,
      }),
    ];
    const merged = mergePitcherStats(enrichment, current);
    // 6 total: FF=4, SL=1, CH=1
    const ff = merged.usage.find((u) => u.typeCode === 'FF');
    const sl = merged.usage.find((u) => u.typeCode === 'SL');
    const ch = merged.usage.find((u) => u.typeCode === 'CH');
    expect(ff?.count).toBe(4);
    expect(sl?.count).toBe(1);
    expect(ch?.count).toBe(1);
    expect(ff?.pct).toBe(67);
    expect(sl?.pct).toBe(17);
    expect(ch?.pct).toBe(17);
  });

  it('sorts merged usage descending by count', () => {
    const enrichment = {
      pitchesThrown: 1,
      strikes: 0,
      balls: 1,
      usage: [{ typeCode: 'SL', typeName: 'Slider', count: 1, pct: 100 }],
    };
    const current = [
      makePitchEvent({ pitchTypeCode: 'FF', isStrike: true }),
      makePitchEvent({ pitchTypeCode: 'FF', isStrike: true }),
    ];
    const merged = mergePitcherStats(enrichment, current);
    expect(merged.usage[0].typeCode).toBe('FF');
    expect(merged.usage[1].typeCode).toBe('SL');
  });

  it('uses UN as typeCode fallback when pitchTypeCode is null', () => {
    const enrichment = ZERO_PITCHER_STATS;
    const current = [makePitchEvent({ pitchTypeCode: null })];
    const merged = mergePitcherStats(enrichment, current);
    expect(merged.usage[0].typeCode).toBe('UN');
  });
});
