import { describe, it, expect } from 'vitest';
import {
  formatScore,
  formatInning,
  formatOuts,
  formatCount,
} from './game-formatter.ts';
import type { GameUpdate } from '../../scheduler/parser.ts';

function makeGameUpdate(overrides: Partial<GameUpdate> = {}): GameUpdate {
  return {
    gameStatus: 'In Progress',
    gamePk: 123456,
    teams: {
      away: { id: 147, name: 'New York Yankees', abbreviation: 'NYY' },
      home: { id: 111, name: 'Boston Red Sox', abbreviation: 'BOS' },
    },
    score: { away: 3, home: 5 },
    inning: { number: 7, half: 'Top', ordinal: '7th' },
    outs: 1,
    defendingTeam: 'BOS',
    battingTeam: 'NYY',
    isDelayed: false,
    delayDescription: null,
    isExtraInnings: false,
    scheduledInnings: 9,
    trackingMode: 'outs',
    outsRemaining: 2,
    totalOutsRemaining: 8,
    runsNeeded: null,
    currentPitcher: {
      id: 543037,
      fullName: 'Gerrit Cole',
      pitchesThrown: 0,
      strikes: 0,
      balls: 0,
      usage: [],
    },
    upcomingPitcher: null,
    inningBreakLength: null,
    atBat: null,
    pitchHistory: [],
    trackedTeamAbbr: 'BOS',
    venueId: null,
    venueFieldInfo: null,
    ...overrides,
  };
}

describe('formatScore', () => {
  it('formats away – home with abbreviations and scores', () => {
    expect(formatScore(makeGameUpdate())).toBe('NYY 3 – BOS 5');
  });

  it('reflects updated score values', () => {
    const update = makeGameUpdate({ score: { away: 0, home: 0 } });
    expect(formatScore(update)).toBe('NYY 0 – BOS 0');
  });

  it('uses team abbreviations (not full names)', () => {
    const result = formatScore(makeGameUpdate());
    expect(result).toContain('NYY');
    expect(result).toContain('BOS');
    expect(result).not.toContain('Yankees');
  });
});

describe('formatInning', () => {
  it('renders up arrow for Top half', () => {
    const update = makeGameUpdate({
      inning: { number: 7, half: 'Top', ordinal: '7th' },
    });
    expect(formatInning(update)).toBe('⬆ 7th');
  });

  it('renders down arrow for Bottom half', () => {
    const update = makeGameUpdate({
      inning: { number: 3, half: 'Bottom', ordinal: '3rd' },
    });
    expect(formatInning(update)).toBe('⬇ 3rd');
  });

  it('uses inning.ordinal directly', () => {
    const update = makeGameUpdate({
      inning: { number: 1, half: 'Top', ordinal: '1st' },
    });
    expect(formatInning(update)).toBe('⬆ 1st');
  });

  it('defaults to up arrow for Middle half (between-innings transitional)', () => {
    const update = makeGameUpdate({
      inning: { number: 5, half: 'Middle', ordinal: '5th' },
    });
    expect(formatInning(update)).toContain('5th');
    expect(formatInning(update)).toContain('⬆');
  });
});

describe('formatOuts', () => {
  it('formats 0 outs', () => {
    expect(formatOuts(0)).toBe('0 out');
  });

  it('formats 1 out', () => {
    expect(formatOuts(1)).toBe('1 out');
  });

  it('formats 2 outs', () => {
    expect(formatOuts(2)).toBe('2 out');
  });

  it('formats 3 outs', () => {
    expect(formatOuts(3)).toBe('3 out');
  });
});

describe('formatCount', () => {
  it('formats balls-strikes', () => {
    expect(formatCount({ balls: 1, strikes: 2 })).toBe('1-2');
  });

  it('formats 0-0 count', () => {
    expect(formatCount({ balls: 0, strikes: 0 })).toBe('0-0');
  });

  it('formats full count', () => {
    expect(formatCount({ balls: 3, strikes: 2 })).toBe('3-2');
  });
});
