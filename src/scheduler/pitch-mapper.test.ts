import { describe, it, expect } from 'vitest';
import { mapPitchEvent } from './pitch-mapper.ts';
import type { PlayEvent } from './game-feed-types.ts';

function makePitchEvent(overrides: Partial<PlayEvent> = {}): PlayEvent {
  return {
    type: 'pitch',
    isPitch: true,
    pitchNumber: 1,
    details: {
      description: 'Called Strike',
      type: { description: 'Four-Seam Fastball' },
      isBall: false,
      isStrike: true,
      isInPlay: false,
    },
    count: { balls: 0, strikes: 1 },
    pitchData: { startSpeed: 95.5 },
    ...overrides,
  };
}

describe('mapPitchEvent', () => {
  it('maps a fully-populated pitch event correctly', () => {
    const pe = makePitchEvent();
    const result = mapPitchEvent(pe);

    expect(result).toEqual({
      pitchNumber: 1,
      pitchType: 'Four-Seam Fastball',
      call: 'Called Strike',
      isBall: false,
      isStrike: true,
      isInPlay: false,
      speedMph: 95.5,
      countAfter: { balls: 0, strikes: 1 },
    });
  });

  it('defaults pitchNumber to 0 when absent', () => {
    const pe = makePitchEvent({ pitchNumber: undefined });
    expect(mapPitchEvent(pe).pitchNumber).toBe(0);
  });

  it('defaults pitchType to "Unknown" when details.type is absent', () => {
    const pe = makePitchEvent({
      details: { description: 'Ball', isBall: true, isStrike: false, isInPlay: false },
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

  it('defaults speedMph to null when startSpeed is null', () => {
    const pe = makePitchEvent({ pitchData: { startSpeed: null } });
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
        type: { description: 'Sinker' },
        isBall: false,
        isStrike: false,
        isInPlay: true,
      },
      pitchNumber: 4,
      count: { balls: 2, strikes: 1 },
      pitchData: { startSpeed: 93.1 },
    });
    const result = mapPitchEvent(pe);

    expect(result.isInPlay).toBe(true);
    expect(result.isBall).toBe(false);
    expect(result.isStrike).toBe(false);
    expect(result.pitchNumber).toBe(4);
    expect(result.countAfter).toEqual({ balls: 2, strikes: 1 });
    expect(result.speedMph).toBe(93.1);
  });
});
