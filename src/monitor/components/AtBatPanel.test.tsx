import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { AtBatPanel } from './AtBatPanel.tsx';
import type { AtBatState, PitchEvent } from '../../server/socket-events.ts';

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

function makePitch(overrides: Partial<PitchEvent> = {}): PitchEvent {
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

describe('AtBatPanel', () => {
  describe('null atBat', () => {
    it('renders nothing when atBat is null', () => {
      const { lastFrame } = render(
        <AtBatPanel atBat={null} pitchDisplay="all" />
      );
      expect(lastFrame()).toBe('');
    });
  });

  describe('with atBat', () => {
    it('renders batting order position and batter name with bat side', () => {
      const atBat = makeAtBat({
        batter: { id: 646240, fullName: 'Rafael Devers', battingOrder: 400 },
        batSide: 'L',
      });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('4. Rafael Devers (L)');
    });

    it('renders pitcher name with pitch hand', () => {
      const { lastFrame } = render(
        <AtBatPanel atBat={makeAtBat()} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('vs Gerrit Cole (R)');
    });

    it('renders left-handed batter side', () => {
      const atBat = makeAtBat({ batSide: 'L' });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('(L)');
    });

    it('renders right-handed batter side', () => {
      const atBat = makeAtBat({ batSide: 'R' });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('(R)');
    });

    it('renders switch hitter', () => {
      const atBat = makeAtBat({ batSide: 'S' });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('(S)');
    });

    it('renders count as balls-strikes', () => {
      const atBat = makeAtBat({ count: { balls: 2, strikes: 1 } });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('Count: 2-1');
    });

    it('derives batting order position from battingOrder field', () => {
      // battingOrder 900 → position 9
      const atBat = makeAtBat({
        batter: { id: 999, fullName: 'Kyle Schwarber', battingOrder: 900 },
      });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('9. Kyle Schwarber');
    });

    it('renders pitch sequence when pitches exist', () => {
      const atBat = makeAtBat({
        pitchSequence: [
          makePitch({
            pitchNumber: 1,
            pitchTypeCode: 'FF',
            speedMph: 97,
            call: 'Called Strike',
          }),
        ],
      });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="all" />
      );
      expect(lastFrame()).toContain('FF 97mph CS');
    });

    it('passes pitchDisplay mode to PitchSequence', () => {
      const atBat = makeAtBat({
        pitchSequence: [
          makePitch({ pitchNumber: 1, pitchTypeCode: 'FF', call: 'Ball' }),
          makePitch({
            pitchNumber: 2,
            pitchTypeCode: 'SL',
            call: 'Called Strike',
          }),
        ],
      });
      const { lastFrame } = render(
        <AtBatPanel atBat={atBat} pitchDisplay="last" />
      );
      const frame = lastFrame() ?? '';
      // Only most recent pitch shown
      expect(frame).toContain('SL');
      expect(frame).not.toContain('FF 96');
    });
  });
});
