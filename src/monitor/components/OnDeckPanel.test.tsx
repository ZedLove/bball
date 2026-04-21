import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { OnDeckPanel } from './OnDeckPanel.tsx';
import type { AtBatState } from '../../server/socket-events.ts';

function makeAtBat(overrides: Partial<AtBatState> = {}): AtBatState {
  return {
    batter: { id: 646240, fullName: 'Rafael Devers', battingOrder: 400 },
    pitcher: { id: 543037, fullName: 'Gerrit Cole' },
    batSide: 'L',
    pitchHand: 'R',
    onDeck: null,
    inHole: null,
    first: null,
    second: null,
    third: null,
    count: { balls: 1, strikes: 2 },
    pitchSequence: [],
    ...overrides,
  };
}

describe('OnDeckPanel', () => {
  describe('null atBat', () => {
    it('renders nothing when atBat is null', () => {
      const { lastFrame } = render(<OnDeckPanel atBat={null} />);
      expect(lastFrame()).toBe('');
    });
  });

  describe('with atBat', () => {
    it('renders Due Up label', () => {
      const { lastFrame } = render(<OnDeckPanel atBat={makeAtBat()} />);
      expect(lastFrame()).toContain('Due Up');
    });

    it('renders OD: with player name when onDeck is set', () => {
      const atBat = makeAtBat({
        onDeck: { id: 677800, fullName: 'Alex Verdugo' },
      });
      const { lastFrame } = render(<OnDeckPanel atBat={atBat} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('OD:');
      expect(frame).toContain('Alex Verdugo');
    });

    it('renders IH: with player name when inHole is set', () => {
      const atBat = makeAtBat({
        inHole: { id: 596019, fullName: 'Xander Bogaerts' },
      });
      const { lastFrame } = render(<OnDeckPanel atBat={atBat} />);
      const frame = lastFrame() ?? '';
      expect(frame).toContain('IH:');
      expect(frame).toContain('Xander Bogaerts');
    });

    it('renders dash when onDeck is null', () => {
      const atBat = makeAtBat({ onDeck: null });
      const { lastFrame } = render(<OnDeckPanel atBat={atBat} />);
      expect(lastFrame()).toContain('OD:');
      expect(lastFrame()).toContain('—');
    });

    it('renders dash when inHole is null', () => {
      const atBat = makeAtBat({ inHole: null });
      const { lastFrame } = render(<OnDeckPanel atBat={atBat} />);
      expect(lastFrame()).toContain('IH:');
    });

    it('does not show batting order number', () => {
      const atBat = makeAtBat({
        onDeck: { id: 677800, fullName: 'Alex Verdugo' },
      });
      const { lastFrame } = render(<OnDeckPanel atBat={atBat} />);
      // No "4." or "5." batting order prefix
      expect(lastFrame()).not.toMatch(/\d\. /u);
    });
  });
});
