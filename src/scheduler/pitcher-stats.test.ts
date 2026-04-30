import { describe, it, expect } from 'vitest';
import {
  mergePitcherStats,
  computePitcherStats,
  ZERO_PITCHER_STATS,
} from './pitcher-stats.ts';
import type { PitchEvent } from '../server/socket-events.ts';
import type { AllPlay, LiveCurrentPlay, PlayEvent } from './game-feed-types.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const PITCHER_ID = 660271;
const OTHER_PITCHER_ID = 605280;

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
      makePitchEvent({
        isStrike: false,
        isBall: false,
        isInPlay: true,
        call: 'In play, out(s)',
      }),
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
      usage: [
        { typeCode: 'FF', typeName: 'Four-Seam Fastball', count: 6, pct: 100 },
      ],
    };
    const current = [
      makePitchEvent({ isStrike: true, isBall: false, isInPlay: false }),
      makePitchEvent({ isStrike: false, isBall: true, isInPlay: false }),
      makePitchEvent({
        isStrike: false,
        isBall: false,
        isInPlay: true,
        call: 'In play, no out',
      }),
    ];
    const merged = mergePitcherStats(enrichment, current);
    expect(merged.strikes + merged.balls).toBe(merged.pitchesThrown);
  });
});

// ---------------------------------------------------------------------------
// computePitcherStats
// ---------------------------------------------------------------------------

function makeRawPitchEvent(overrides: Partial<PlayEvent> = {}): PlayEvent {
  return {
    type: 'pitch',
    isPitch: true,
    pitchNumber: 1,
    details: {
      description: 'Ball',
      type: { code: 'FF', description: 'Four-Seam Fastball' },
      isBall: true,
      isStrike: false,
      isInPlay: false,
    },
    count: { balls: 1, strikes: 0 },
    ...overrides,
  };
}

function makeAllPlay(
  pitcherId: number,
  pitchEvents: PlayEvent[],
  overrides: Partial<AllPlay> = {}
): AllPlay {
  return {
    atBatIndex: 0,
    result: {
      eventType: 'strikeout',
      description: 'Batter strikes out.',
      rbi: 0,
    },
    about: {
      atBatIndex: 0,
      halfInning: 'top',
      inning: 1,
      isComplete: true,
      isScoringPlay: false,
    },
    matchup: {
      batter: { id: 596019, fullName: 'Francisco Lindor' },
      pitcher: { id: pitcherId, fullName: 'Shohei Ohtani' },
    },
    playEvents: pitchEvents,
    ...overrides,
  };
}

function makeLiveCurrentPlay(
  pitcherId: number,
  pitchEvents: PlayEvent[],
  isComplete = false
): LiveCurrentPlay {
  return {
    about: { atBatIndex: 5, halfInning: 'top', inning: 2, isComplete },
    count: { balls: 0, strikes: 0, outs: 1 },
    matchup: {
      batter: { id: 596019, fullName: 'Francisco Lindor' },
      pitcher: { id: pitcherId, fullName: 'Shohei Ohtani' },
      batSide: { code: 'R' },
      pitchHand: { code: 'R' },
    },
    playEvents: pitchEvents,
  };
}

describe('computePitcherStats', () => {
  it('returns zero stats when allPlays is empty and currentPlay is null', () => {
    const result = computePitcherStats(PITCHER_ID, [], null);
    expect(result.stats).toBe(ZERO_PITCHER_STATS);
    expect(result.pitchHistory).toEqual([]);
  });

  it('computes stats from completed plays only', () => {
    const plays = [
      makeAllPlay(PITCHER_ID, [
        makeRawPitchEvent({
          details: {
            description: 'Called Strike',
            isStrike: true,
            isBall: false,
            isInPlay: false,
          },
        }),
        makeRawPitchEvent({
          details: {
            description: 'Ball',
            isBall: true,
            isStrike: false,
            isInPlay: false,
          },
        }),
        makeRawPitchEvent({
          details: {
            description: 'Called Strike',
            isStrike: true,
            isBall: false,
            isInPlay: false,
          },
        }),
      ]),
    ];
    const result = computePitcherStats(PITCHER_ID, plays, null);
    expect(result.stats.pitchesThrown).toBe(3);
    expect(result.stats.strikes).toBe(2);
    expect(result.stats.balls).toBe(1);
    expect(result.pitchHistory).toHaveLength(3);
  });

  it('includes in-progress at-bat pitches when currentPlay matches pitcher', () => {
    const current = makeLiveCurrentPlay(PITCHER_ID, [
      makeRawPitchEvent({
        details: {
          description: 'Ball',
          isBall: true,
          isStrike: false,
          isInPlay: false,
        },
      }),
      makeRawPitchEvent({
        details: {
          description: 'Swinging Strike',
          isStrike: true,
          isBall: false,
          isInPlay: false,
        },
      }),
    ]);
    const result = computePitcherStats(PITCHER_ID, [], current);
    expect(result.stats.pitchesThrown).toBe(2);
    expect(result.stats.strikes).toBe(1);
    expect(result.stats.balls).toBe(1);
    expect(result.pitchHistory).toHaveLength(2);
  });

  it('excludes in-progress at-bat when currentPlay is for a different pitcher', () => {
    const current = makeLiveCurrentPlay(OTHER_PITCHER_ID, [
      makeRawPitchEvent(),
    ]);
    const result = computePitcherStats(PITCHER_ID, [], current);
    expect(result.stats).toBe(ZERO_PITCHER_STATS);
    expect(result.pitchHistory).toEqual([]);
  });

  it('excludes currentPlay when isComplete is true (avoids double-counting)', () => {
    const completedPitches = [
      makeRawPitchEvent({
        details: {
          description: 'Called Strike',
          isStrike: true,
          isBall: false,
          isInPlay: false,
        },
      }),
    ];
    const plays = [makeAllPlay(PITCHER_ID, completedPitches)];
    // currentPlay has isComplete=true — same play, would double-count if included.
    const current = makeLiveCurrentPlay(PITCHER_ID, completedPitches, true);
    const result = computePitcherStats(PITCHER_ID, plays, current);
    expect(result.stats.pitchesThrown).toBe(1);
  });

  it('counts isInPlay pitches as strikes in computed stats', () => {
    const plays = [
      makeAllPlay(PITCHER_ID, [
        makeRawPitchEvent({
          details: {
            description: 'In play, out(s)',
            isInPlay: true,
            isStrike: false,
            isBall: false,
          },
        }),
      ]),
    ];
    const result = computePitcherStats(PITCHER_ID, plays, null);
    expect(result.stats.strikes).toBe(1);
    expect(result.stats.balls).toBe(0);
    expect(result.stats.strikes + result.stats.balls).toBe(
      result.stats.pitchesThrown
    );
  });

  it('returns pitchHistory in order: completed plays then current at-bat', () => {
    const completedPitch = makeRawPitchEvent({
      pitchNumber: 1,
      details: {
        description: 'Ball',
        isBall: true,
        isStrike: false,
        isInPlay: false,
      },
    });
    const currentPitch = makeRawPitchEvent({
      pitchNumber: 2,
      details: {
        description: 'Called Strike',
        isStrike: true,
        isBall: false,
        isInPlay: false,
      },
    });
    const plays = [makeAllPlay(PITCHER_ID, [completedPitch])];
    const current = makeLiveCurrentPlay(PITCHER_ID, [currentPitch]);
    const result = computePitcherStats(PITCHER_ID, plays, current);
    expect(result.pitchHistory).toHaveLength(2);
    expect(result.pitchHistory[0].isBall).toBe(true);
    expect(result.pitchHistory[1].isStrike).toBe(true);
  });

  it('filters allPlays to only the specified pitcherId', () => {
    const plays = [
      makeAllPlay(PITCHER_ID, [makeRawPitchEvent(), makeRawPitchEvent()]),
      makeAllPlay(OTHER_PITCHER_ID, [makeRawPitchEvent()]),
    ];
    const result = computePitcherStats(PITCHER_ID, plays, null);
    expect(result.stats.pitchesThrown).toBe(2);
  });

  it('skips non-pitch play events when building pitchHistory', () => {
    const actionEvent: PlayEvent = {
      type: 'action',
      details: {
        description: 'Pitching substitution',
        eventType: 'pitching_substitution',
      },
    };
    const plays = [makeAllPlay(PITCHER_ID, [makeRawPitchEvent(), actionEvent])];
    const result = computePitcherStats(PITCHER_ID, plays, null);
    expect(result.stats.pitchesThrown).toBe(1);
    expect(result.pitchHistory).toHaveLength(1);
  });
});
