import { describe, it, expect } from 'vitest';
import { mapPitchEvent } from './pitch-mapper.ts';
import type { PlayEvent, PitchData, HitData } from './game-feed-types.ts';

function makePitchData(overrides: Partial<PitchData> = {}): PitchData {
  return {
    startSpeed: 95.5,
    endSpeed: 87.2,
    strikeZoneTop: 3.3,
    strikeZoneBottom: 1.6,
    strikeZoneWidth: 17.0,
    strikeZoneDepth: 8.5,
    plateTime: 0.408,
    extension: 5.6,
    zone: 5,
    coordinates: {
      pX: 0.12,
      pZ: 2.45,
      x: 119.0,
      y: 175.0,
      x0: 0.5,
      y0: 50.0,
      z0: 6.1,
      vX0: -3.5,
      vY0: -137.5,
      vZ0: -5.0,
      aX: 8.5,
      aY: 30.5,
      aZ: -19.5,
      pfxX: 5.5,
      pfxZ: 10.2,
    },
    breaks: {
      spinRate: 2350,
      spinDirection: 205,
      breakAngle: 6.5,
      breakVertical: -12.5,
      breakVerticalInduced: 14.5,
      breakHorizontal: -8.5,
    },
    ...overrides,
  };
}

function makeHitData(overrides: Partial<HitData> = {}): HitData {
  return {
    launchSpeed: 111.6,
    launchAngle: 30.0,
    totalDistance: 425.0,
    trajectory: 'fly_ball',
    hardness: 'hard',
    location: '8',
    coordinates: { coordX: 113.48, coordY: 27.53 },
    ...overrides,
  };
}

function makePitchEvent(overrides: Partial<PlayEvent> = {}): PlayEvent {
  return {
    type: 'pitch',
    isPitch: true,
    pitchNumber: 1,
    details: {
      description: 'Called Strike',
      type: { code: 'FF', description: 'Four-Seam Fastball' },
      isBall: false,
      isStrike: true,
      isInPlay: false,
    },
    count: { balls: 0, strikes: 1 },
    pitchData: makePitchData(),
    ...overrides,
  };
}

describe('mapPitchEvent', () => {
  it('maps a fully-populated pitch event correctly', () => {
    const pe = makePitchEvent();
    const result = mapPitchEvent(pe);

    expect(result.pitchNumber).toBe(1);
    expect(result.pitchType).toBe('Four-Seam Fastball');
    expect(result.call).toBe('Called Strike');
    expect(result.isBall).toBe(false);
    expect(result.isStrike).toBe(true);
    expect(result.isInPlay).toBe(false);
    expect(result.speedMph).toBe(95.5);
    expect(result.countAfter).toEqual({ balls: 0, strikes: 1 });
  });

  it('defaults pitchNumber to 0 when absent', () => {
    const pe = makePitchEvent({ pitchNumber: undefined });
    expect(mapPitchEvent(pe).pitchNumber).toBe(0);
  });

  it('defaults pitchType to "Unknown" when details.type is absent', () => {
    const pe = makePitchEvent({
      details: {
        description: 'Ball',
        isBall: true,
        isStrike: false,
        isInPlay: false,
      },
    });
    expect(mapPitchEvent(pe).pitchType).toBe('Unknown');
  });

  it('defaults isBall, isStrike, isInPlay to false when absent', () => {
    const pe = makePitchEvent({
      details: { description: 'Called Strike' },
    });
    const result = mapPitchEvent(pe);
    expect(result.isBall).toBe(false);
    expect(result.isStrike).toBe(false);
    expect(result.isInPlay).toBe(false);
  });

  it('defaults speedMph to null when pitchData is absent', () => {
    const pe = makePitchEvent({ pitchData: undefined });
    expect(mapPitchEvent(pe).speedMph).toBeNull();
  });

  it('defaults countAfter to { balls: 0, strikes: 0 } when count is absent', () => {
    const pe = makePitchEvent({ count: undefined });
    expect(mapPitchEvent(pe).countAfter).toEqual({ balls: 0, strikes: 0 });
  });

  it('maps an in-play pitch correctly', () => {
    const pe = makePitchEvent({
      details: {
        description: 'In play, run(s)',
        type: { code: 'SI', description: 'Sinker' },
        isBall: false,
        isStrike: false,
        isInPlay: true,
      },
      pitchNumber: 4,
      count: { balls: 2, strikes: 1 },
      pitchData: makePitchData({ startSpeed: 93.1 }),
    });
    const result = mapPitchEvent(pe);

    expect(result.isInPlay).toBe(true);
    expect(result.isBall).toBe(false);
    expect(result.isStrike).toBe(false);
    expect(result.pitchNumber).toBe(4);
    expect(result.countAfter).toEqual({ balls: 2, strikes: 1 });
    expect(result.speedMph).toBe(93.1);
  });

  // ---------------------------------------------------------------------------
  // pitchTypeCode
  // ---------------------------------------------------------------------------

  it('maps pitchTypeCode from details.type.code', () => {
    const pe = makePitchEvent({
      details: {
        description: 'Ball',
        type: { code: 'SI', description: 'Sinker' },
        isBall: true,
        isStrike: false,
        isInPlay: false,
      },
    });
    expect(mapPitchEvent(pe).pitchTypeCode).toBe('SI');
  });

  it('sets pitchTypeCode to null when details.type is absent', () => {
    const pe = makePitchEvent({
      details: {
        description: 'Ball',
        isBall: true,
        isStrike: false,
        isInPlay: false,
      },
    });
    expect(mapPitchEvent(pe).pitchTypeCode).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // tracking
  // ---------------------------------------------------------------------------

  it('populates tracking with all fields from pitchData', () => {
    const pd = makePitchData();
    const pe = makePitchEvent({ pitchData: pd });
    const { tracking } = mapPitchEvent(pe);

    expect(tracking).not.toBeNull();
    expect(tracking!.startSpeed).toBe(95.5);
    expect(tracking!.endSpeed).toBe(87.2);
    expect(tracking!.strikeZoneTop).toBe(3.3);
    expect(tracking!.strikeZoneBottom).toBe(1.6);
    expect(tracking!.strikeZoneWidth).toBe(17.0);
    expect(tracking!.strikeZoneDepth).toBe(8.5);
    expect(tracking!.plateTime).toBe(0.408);
    expect(tracking!.extension).toBe(5.6);
    expect(tracking!.zone).toBe(5);
    expect(tracking!.coordinates.pX).toBe(0.12);
    expect(tracking!.coordinates.pZ).toBe(2.45);
    expect(tracking!.coordinates.pfxX).toBe(5.5);
    expect(tracking!.coordinates.pfxZ).toBe(10.2);
    expect(tracking!.breaks.spinRate).toBe(2350);
    expect(tracking!.breaks.spinDirection).toBe(205);
    expect(tracking!.breaks.breakVerticalInduced).toBe(14.5);
    expect(tracking!.breaks.breakHorizontal).toBe(-8.5);
  });

  it('sets tracking to null when pitchData is absent', () => {
    const pe = makePitchEvent({ pitchData: undefined });
    expect(mapPitchEvent(pe).tracking).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // hitData
  // ---------------------------------------------------------------------------

  it('populates hitData for an in-play home run pitch', () => {
    const pe = makePitchEvent({
      details: {
        description: 'In play, run(s)',
        type: { code: 'FF', description: 'Four-Seam Fastball' },
        isBall: false,
        isStrike: false,
        isInPlay: true,
      },
      hitData: makeHitData(),
    });
    const { hitData } = mapPitchEvent(pe);

    expect(hitData).not.toBeNull();
    expect(hitData!.launchSpeed).toBe(111.6);
    expect(hitData!.launchAngle).toBe(30.0);
    expect(hitData!.totalDistance).toBe(425.0);
    expect(hitData!.trajectory).toBe('fly_ball');
    expect(hitData!.hardness).toBe('hard');
    expect(hitData!.location).toBe('8');
    expect(hitData!.coordinates).toEqual({ coordX: 113.48, coordY: 27.53 });
  });

  it('populates hitData for a ground ball with negative launchAngle', () => {
    const pe = makePitchEvent({
      details: {
        description: 'In play, out(s)',
        type: { code: 'SI', description: 'Sinker' },
        isBall: false,
        isStrike: false,
        isInPlay: true,
      },
      hitData: makeHitData({
        launchSpeed: 85.4,
        launchAngle: -4.0,
        totalDistance: 120.0,
        trajectory: 'ground_ball',
        hardness: 'medium',
        location: '6',
        coordinates: { coordX: 98.0, coordY: 155.0 },
      }),
    });
    const { hitData } = mapPitchEvent(pe);

    expect(hitData).not.toBeNull();
    expect(hitData!.launchAngle).toBe(-4.0);
    expect(hitData!.trajectory).toBe('ground_ball');
  });

  it('sets hitData to null when hitData is absent (non-in-play pitch)', () => {
    const pe = makePitchEvent({ hitData: undefined });
    expect(mapPitchEvent(pe).hitData).toBeNull();
  });
});
