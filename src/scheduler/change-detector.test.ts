import { describe, it, expect } from 'vitest';
import { hasLinescoreDelta } from './change-detector.ts';
import type { Linescore } from './schedule-client.ts';

function makeLinescore(overrides: Partial<Linescore> = {}): Linescore {
  return {
    currentInning: 5,
    currentInningOrdinal: '5th',
    inningState: 'Top',
    scheduledInnings: 9,
    outs: 1,
    balls: 2,
    strikes: 1,
    teams: {
      home: { runs: 1, hits: 3, errors: 0 },
      away: { runs: 2, hits: 5, errors: 1 },
    },
    defense: { pitcher: { id: 660271, fullName: 'Shohei Ohtani' } },
    offense: { batter: { id: 596019, fullName: 'Francisco Lindor' } },
    ...overrides,
  };
}

describe('hasLinescoreDelta', () => {
  describe('first-tick bootstrap', () => {
    it('returns false when previous is null (first tick — skip enrichment)', () => {
      const current = makeLinescore();
      expect(hasLinescoreDelta(current, null)).toBe(false);
    });
  });

  describe('no change', () => {
    it('returns false when linescore is identical to previous', () => {
      const current = makeLinescore();
      const previous = makeLinescore();
      expect(hasLinescoreDelta(current, previous)).toBe(false);
    });
  });

  describe('score changes', () => {
    it('returns true when the home run total increases', () => {
      const previous = makeLinescore();
      const current = makeLinescore({ teams: { home: { runs: 2, hits: 3, errors: 0 }, away: { runs: 2, hits: 5, errors: 1 } } });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });

    it('returns true when the away run total increases', () => {
      const previous = makeLinescore();
      const current = makeLinescore({ teams: { home: { runs: 1, hits: 3, errors: 0 }, away: { runs: 3, hits: 5, errors: 1 } } });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });
  });

  describe('inning changes', () => {
    it('returns true when the inning number advances', () => {
      const previous = makeLinescore({ currentInning: 5 });
      const current = makeLinescore({ currentInning: 6 });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });

    // inningState (Top / Middle / Bottom / End) is intentionally excluded from
    // the signal.  In practice, inningState transitions always coincide with an
    // outs change or a batter change, which are already in the signal.
    it('returns false when only inningState changes (Top → Middle)', () => {
      const previous = makeLinescore({ inningState: 'Top' });
      const current = makeLinescore({ inningState: 'Middle' });
      expect(hasLinescoreDelta(current, previous)).toBe(false);
    });

    it('returns false when only inningState changes (Bottom → End)', () => {
      const previous = makeLinescore({ inningState: 'Bottom' });
      const current = makeLinescore({ inningState: 'End' });
      expect(hasLinescoreDelta(current, previous)).toBe(false);
    });
  });

  describe('outs changes', () => {
    it('returns true when outs increases (new out recorded)', () => {
      const previous = makeLinescore({ outs: 1 });
      const current = makeLinescore({ outs: 2 });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });

    it('returns true when outs resets to 0 (side retired, new half-inning)', () => {
      const previous = makeLinescore({ outs: 2 });
      const current = makeLinescore({ outs: 0 });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });
  });

  describe('batter changes', () => {
    it('returns true when offense.batter.id changes (new batter up)', () => {
      const previous = makeLinescore({ offense: { batter: { id: 596019, fullName: 'Francisco Lindor' } } });
      const current = makeLinescore({ offense: { batter: { id: 605280, fullName: 'Clay Holmes' } } });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });

    it('returns true when offense changes from present to absent (between-innings)', () => {
      const previous = makeLinescore({ offense: { batter: { id: 596019, fullName: 'Francisco Lindor' } } });
      const current = makeLinescore({ offense: undefined });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });

    it('returns true when offense transitions from absent to present', () => {
      const previous = makeLinescore({ offense: undefined });
      const current = makeLinescore({ offense: { batter: { id: 596019, fullName: 'Francisco Lindor' } } });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });
  });

  describe('pitcher changes', () => {
    it('returns true when defense.pitcher changes (pitching substitution)', () => {
      const previous = makeLinescore({ defense: { pitcher: { id: 660271, fullName: 'Shohei Ohtani' } } });
      const current = makeLinescore({ defense: { pitcher: { id: 668964, fullName: 'Tobias Myers' } } });
      expect(hasLinescoreDelta(current, previous)).toBe(true);
    });
  });

  // Balls and strikes change on every pitch.  Excluding them prevents enrichment
  // from firing 5-7× per at-bat instead of once per completed play.
  describe('per-pitch noise (must not trigger)', () => {
    it('returns false when only balls count changes', () => {
      const previous = makeLinescore({ balls: 0 });
      const current = makeLinescore({ balls: 1 });
      expect(hasLinescoreDelta(current, previous)).toBe(false);
    });

    it('returns false when only strikes count changes', () => {
      const previous = makeLinescore({ strikes: 0 });
      const current = makeLinescore({ strikes: 1 });
      expect(hasLinescoreDelta(current, previous)).toBe(false);
    });

    it('returns false when both balls and strikes change but no signal field changes', () => {
      const previous = makeLinescore({ balls: 1, strikes: 1 });
      const current = makeLinescore({ balls: 2, strikes: 1 });
      expect(hasLinescoreDelta(current, previous)).toBe(false);
    });
  });
});
