import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logUpdate } from '../scheduler/logger.ts';
import { logger } from './logger.ts';
import type { GameUpdate } from '../scheduler/parser.ts';

describe('logUpdate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  });

  const makeUpdate = (overrides: Partial<GameUpdate> = {}): GameUpdate => ({
    gameStatus: 'In Progress',
    teams: {
      away: { id: 121, name: 'New York Mets', abbreviation: 'NYM' },
      home: { id: 138, name: 'St. Louis Cardinals', abbreviation: 'STL' },
    },
    score: { away: 2, home: 1 },
    inning: { number: 5, half: 'Top', ordinal: '5th' },
    outs: 1,
    defendingTeam: 'STL',
    battingTeam: 'NYM',
    isDelayed: false,
    delayDescription: null,
    isExtraInnings: false,
    scheduledInnings: 9,
    trackingMode: 'outs',
    outsRemaining: 2,
    totalOutsRemaining: 14,
    runsNeeded: null,
    currentPitcher: null,
    pitchingChange: false,
    inningBreakLength: null,
    ...overrides,
  });

  describe('when trackingMode is "outs"', () => {
    it('logs defending team, inning, outs, and score', () => {
      const update = makeUpdate({ trackingMode: 'outs', defendingTeam: 'STL' });
      logUpdate(update);
      expect(logSpy).toHaveBeenCalled();
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('defending');
    });

    it('includes total outs remaining when available', () => {
      const update = makeUpdate({ trackingMode: 'outs', totalOutsRemaining: 14 });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('total');
    });

    it('excludes total outs remaining when null', () => {
      const update = makeUpdate({ trackingMode: 'outs', totalOutsRemaining: null });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).not.toContain('total');
    });

    it('includes pitcher name when available', () => {
      const update = makeUpdate({
        trackingMode: 'outs',
        currentPitcher: { id: 12345, fullName: 'Max Scherzer' },
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Max Scherzer');
    });

    it('flags pitching changes', () => {
      const update = makeUpdate({
        trackingMode: 'outs',
        pitchingChange: true,
        currentPitcher: { id: 12345, fullName: 'New Pitcher' },
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('PITCHING CHANGE');
    });

    it('includes [EXTRAS] flag for extra innings', () => {
      const update = makeUpdate({ trackingMode: 'outs', isExtraInnings: true });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('EXTRAS');
    });

    it('includes [DELAYED] flag when delayed', () => {
      const update = makeUpdate({ trackingMode: 'outs', isDelayed: true });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('DELAYED');
    });
  });

  describe('when trackingMode is "runs"', () => {
    it('logs batting (extras), inning, runs needed, and score', () => {
      const update = makeUpdate({
        trackingMode: 'runs',
        runsNeeded: 3,
        isExtraInnings: true,
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Batting');
      expect(allArgs).toContain('EXTRAS');
    });

    it('includes [DELAYED] flag when delayed', () => {
      const update = makeUpdate({ trackingMode: 'runs', isDelayed: true, isExtraInnings: true });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('DELAYED');
    });
  });

  describe('when trackingMode is "between-innings"', () => {
    it('logs between innings, inning, and score', () => {
      const update = makeUpdate({
        trackingMode: 'between-innings',
        inning: { number: 5, half: 'Middle', ordinal: '5th' },
        inningBreakLength: 120,
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Between innings');
    });

    it('includes pitcher name when available', () => {
      const update = makeUpdate({
        trackingMode: 'between-innings',
        currentPitcher: { id: 12345, fullName: 'Max Scherzer' },
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Max Scherzer');
    });

    it('includes [DELAYED] flag when delayed', () => {
      const update = makeUpdate({ trackingMode: 'between-innings', isDelayed: true });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('DELAYED');
    });
  });

  describe('when trackingMode is "final"', () => {
    it('logs game final, inning, and score', () => {
      const update = makeUpdate({
        trackingMode: 'final',
        inning: { number: 9, half: 'Bottom', ordinal: '9th' },
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Final');
    });
  });

  describe('when trackingMode is "batting"', () => {
    it('logs batting team, inning, and score', () => {
      const update = makeUpdate({ trackingMode: 'batting', battingTeam: 'STL' });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('batting');
    });

    it('includes [DELAYED] flag when delayed', () => {
      const update = makeUpdate({ trackingMode: 'batting', isDelayed: true });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('DELAYED');
    });
  });
});
