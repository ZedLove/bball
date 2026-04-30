import { describe, it, expect } from 'vitest';
import { mergePitcherStats, ZERO_PITCHER_STATS } from './pitcher-stats.ts';
import type { PitchEvent } from '../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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

  it('counts isInPlay pitches as strikes (broadcast convention)', () => {
    const enrichment = ZERO_PITCHER_STATS;
    const current = [
      makePitchEvent({ isStrike: false, isBall: false, isInPlay: true, call: 'In play, out(s)' }),
    ];
    const merged = mergePitcherStats(enrichment, current);
    expect(merged.pitchesThrown).toBe(1);
    expect(merged.strikes).toBe(1);
    expect(merged.balls).toBe(0);
  });

  it('satisfies strikes + balls = pitchesThrown when in-play pitches are present', () => {
    const enrichment = {
      pitchesThrown: 6,
      strikes: 4,
      balls: 2,
      usage: [{ typeCode: 'FF', typeName: 'Four-Seam Fastball', count: 6, pct: 100 }],
    };
    const current = [
      makePitchEvent({ isStrike: true, isBall: false, isInPlay: false }),
      makePitchEvent({ isStrike: false, isBall: true, isInPlay: false }),
      makePitchEvent({ isStrike: false, isBall: false, isInPlay: true, call: 'In play, no out' }),
    ];
    const merged = mergePitcherStats(enrichment, current);
    expect(merged.strikes + merged.balls).toBe(merged.pitchesThrown);
  });
});
