import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { LineupPanel } from './LineupPanel.tsx';
import type { AtBatState, LineupEntry } from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeEntry(
  id: number,
  fullName: string,
  battingOrder: number,
  overrides: Partial<LineupEntry> = {}
): LineupEntry {
  return {
    id,
    fullName,
    battingOrder,
    atBats: 0,
    hits: 0,
    seasonOps: null,
    ...overrides,
  };
}

/** Builds a 9-player lineup. Batter is slot 4 (battingOrder 400). */
function makeLineup(): LineupEntry[] {
  return [
    makeEntry(101, 'Player One', 100, { atBats: 3, hits: 1 }),
    makeEntry(102, 'Player Two', 200, { atBats: 3, hits: 2 }),
    makeEntry(103, 'Player Three', 300, { atBats: 2, hits: 0 }),
    makeEntry(646240, 'Rafael Devers', 400, { atBats: 3, hits: 1 }),
    makeEntry(105, 'Player Five', 500, {
      atBats: 2,
      hits: 0,
      seasonOps: '.752',
    }),
    makeEntry(106, 'Player Six', 600, {
      atBats: 0,
      hits: 0,
      seasonOps: '.698',
    }),
    makeEntry(107, 'Player Seven', 700, { atBats: 2, hits: 1 }),
    makeEntry(677800, 'Alex Verdugo', 800, { atBats: 3, hits: 0 }),
    makeEntry(596019, 'Xander Bogaerts', 900, { atBats: 2, hits: 0 }),
  ];
}

function makeAtBat(overrides: Partial<AtBatState> = {}): AtBatState {
  return {
    batter: { id: 646240, fullName: 'Rafael Devers', battingOrder: 400 },
    pitcher: { id: 543037, fullName: 'Gerrit Cole' },
    batSide: 'L',
    pitchHand: 'R',
    onDeck: { id: 677800, fullName: 'Alex Verdugo' },
    inHole: { id: 596019, fullName: 'Xander Bogaerts' },
    first: null,
    second: null,
    third: null,
    count: { balls: 1, strikes: 2 },
    pitchSequence: [],
    lineup: makeLineup(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LineupPanel', () => {
  describe('null atBat', () => {
    it('renders empty shell with Lineup label when atBat is null', () => {
      const { lastFrame } = render(<LineupPanel atBat={null} />);
      expect(lastFrame()).toContain('Lineup');
    });
  });

  describe('empty lineup', () => {
    it('renders nothing when lineup is empty', () => {
      const atBat = makeAtBat({ lineup: [] });
      const { lastFrame } = render(<LineupPanel atBat={atBat} />);
      expect(lastFrame()).toBe('');
    });
  });

  describe('rendering all 9 slots', () => {
    it('renders all 9 player names', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Rafael Devers');
      expect(frame).toContain('Player One');
      expect(frame).toContain('Player Two');
      expect(frame).toContain('Alex Verdugo');
      expect(frame).toContain('Xander Bogaerts');
    });

    it('renders slot numbers 1-9', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      for (let slot = 1; slot <= 9; slot++) {
        expect(frame).toContain(`${String(slot)}.`);
      }
    });

    it('renders Lineup label', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      expect(lastFrame()).toContain('Lineup');
    });
  });

  describe('current batter', () => {
    it('includes handedness suffix for the current batter', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      // batSide is 'L' for Devers
      expect(frame).toContain('Rafael Devers (L)');
    });

    it('omits handedness suffix for all other players', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      // Players who are neither current batter nor OD/IH should have no hand marker.
      // Player One (slot 1) is not batter/OD/IH — must not have a (L)/(R)/(S) suffix.
      expect(frame).not.toContain('Player One (');
      // The current batter (Devers) has (L) but NOT OD/IH suffix
      expect(frame).toContain('Rafael Devers (L)');
      // OD/IH players have parenthetical suffixes but NOT a hand code
      expect(frame).not.toContain('Alex Verdugo (L)');
      expect(frame).not.toContain('Alex Verdugo (R)');
      expect(frame).not.toContain('Xander Bogaerts (L)');
      expect(frame).not.toContain('Xander Bogaerts (R)');
    });

    it('does not add OD or IH suffix to the current batter', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('Devers (OD)');
      expect(frame).not.toContain('Devers (IH)');
    });
  });

  describe('on-deck and in-hole labels', () => {
    it('renders (OD) suffix for the on-deck player', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Alex Verdugo (OD)');
    });

    it('renders (IH) suffix for the in-hole player', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Xander Bogaerts (IH)');
    });

    it('does not add OD suffix when onDeck is null', () => {
      const atBat = makeAtBat({ onDeck: null });
      const { lastFrame } = render(<LineupPanel atBat={atBat} />);
      expect(lastFrame()).not.toContain('(OD)');
    });

    it('does not add IH suffix when inHole is null', () => {
      const atBat = makeAtBat({ inHole: null });
      const { lastFrame } = render(<LineupPanel atBat={atBat} />);
      expect(lastFrame()).not.toContain('(IH)');
    });
  });

  describe('stat display', () => {
    it('shows H-AB when atBats > 0', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      // Player One: atBats: 3, hits: 1 → "1-3"
      expect(frame).toContain('1-3');
      // Rafael Devers: atBats: 3, hits: 1 → "1-3"
      expect(frame).toContain('Rafael Devers');
    });

    it('shows season OPS when atBats === 0 and seasonOps is not null', () => {
      const { lastFrame } = render(<LineupPanel atBat={makeAtBat()} />);
      const frame = lastFrame() ?? '';
      // Player Six: atBats: 0, seasonOps: '.698'
      expect(frame).toContain('.698 OPS');
    });

    it('shows no stat when atBats === 0 and seasonOps is null', () => {
      const atBat = makeAtBat({
        lineup: [makeEntry(999, 'No Stat Player', 100)],
        batter: { id: 999, fullName: 'No Stat Player', battingOrder: 100 },
        onDeck: null,
        inHole: null,
      });
      const { lastFrame } = render(<LineupPanel atBat={atBat} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('No Stat Player');
      // No OPS, no H-AB
      expect(frame).not.toContain('OPS');
      expect(frame).not.toContain('-0');
    });
  });

  describe('ordering', () => {
    it('renders slots in ascending batting order even when lineup is unsorted', () => {
      const shuffled = [...makeLineup()].reverse();
      const atBat = makeAtBat({ lineup: shuffled });
      const { lastFrame } = render(<LineupPanel atBat={atBat} />);
      const frame = lastFrame() ?? '';
      // Slot 1 should appear before slot 9 in the rendered output
      const idx1 = frame.indexOf('1.');
      const idx9 = frame.indexOf('9.');
      expect(idx1).toBeLessThan(idx9);
    });
  });
});
