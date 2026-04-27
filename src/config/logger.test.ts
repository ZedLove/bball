import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logUpdate } from '../scheduler/logger.ts';
import { logger } from './logger.ts';
import type { GameUpdate } from '../server/socket-events.ts';

describe('logUpdate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(logger, 'info' as any).mockImplementation(() => logger);
  });

  const makeUpdate = (overrides: Partial<GameUpdate> = {}): GameUpdate => ({
    gameStatus: 'In Progress',
    gamePk: 823077,
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
    trackingMode: 'live',
    outsRemaining: 2,
    totalOutsRemaining: 14,
    runsNeeded: null,
    currentPitcher: null,
    upcomingPitcher: null,
    atBat: null,
    pitchHistory: [],
    trackedTeamAbbr: 'STL',
    venueId: null,
    venueFieldInfo: null,
    ...overrides,
  });

  describe('when trackingMode is "live"', () => {
    it('logs LIVE prefix, inning, and score', () => {
      const update = makeUpdate({ trackingMode: 'live' });
      logUpdate(update);
      expect(logSpy).toHaveBeenCalled();
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('LIVE');
    });

    it('includes outs remaining when outsRemaining is set', () => {
      const update = makeUpdate({
        trackingMode: 'live',
        outsRemaining: 2,
        totalOutsRemaining: 14,
      });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('Outs:');
    });

    it('includes total outs remaining when available', () => {
      const update = makeUpdate({
        trackingMode: 'live',
        outsRemaining: 2,
        totalOutsRemaining: 14,
      });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('14');
    });

    it('excludes outs section when outsRemaining is null', () => {
      const update = makeUpdate({
        trackingMode: 'live',
        outsRemaining: null,
        totalOutsRemaining: null,
      });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).not.toContain('Outs:');
    });

    it('includes pitcher name when available', () => {
      const update = makeUpdate({
        trackingMode: 'live',
        currentPitcher: {
          id: 12345,
          fullName: 'Max Scherzer',
          pitchesThrown: 0,
          strikes: 0,
          balls: 0,
          usage: [],
        },
      });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('Max Scherzer');
    });

    it('includes [EXTRAS] flag for extra innings', () => {
      const update = makeUpdate({ trackingMode: 'live', isExtraInnings: true });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('EXTRAS');
    });

    it('includes runs needed and [EXTRAS] when runsNeeded is set', () => {
      const update = makeUpdate({
        trackingMode: 'live',
        runsNeeded: 2,
        isExtraInnings: true,
      });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('Runs needed');
      expect(allArgs).toContain('EXTRAS');
    });

    it('includes [DELAYED] flag when delayed', () => {
      const update = makeUpdate({ trackingMode: 'live', isDelayed: true });
      logUpdate(update);
      const allArgs = logSpy.mock.calls[0]!.map(String).join('');
      expect(allArgs).toContain('DELAYED');
    });
  });

  describe('when trackingMode is "between-innings"', () => {
    it('logs between innings, inning, and score', () => {
      const update = makeUpdate({
        trackingMode: 'between-innings',
        inning: { number: 5, half: 'Middle', ordinal: '5th' },
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Between innings');
    });

    it('includes upcoming pitcher name when available', () => {
      const update = makeUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: { id: 12345, fullName: 'Max Scherzer' },
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).toContain('Max Scherzer');
    });

    it('does not include pitcher info when upcomingPitcher is null', () => {
      const update = makeUpdate({
        trackingMode: 'between-innings',
        upcomingPitcher: null,
      });
      logUpdate(update);
      const calls = logSpy.mock.calls[0];
      const allArgs = calls.map(String).join('');
      expect(allArgs).not.toContain('Next P:');
    });

    it('includes [DELAYED] flag when delayed', () => {
      const update = makeUpdate({
        trackingMode: 'between-innings',
        isDelayed: true,
      });
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
});
