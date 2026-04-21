import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { BaseDiamond } from './BaseDiamond.tsx';
import type { AtBatState, RunnerState } from '../../server/socket-events.ts';

function makeRunner(overrides: Partial<RunnerState> = {}): RunnerState {
  return {
    id: 1,
    fullName: 'Test Runner',
    seasonSb: 0,
    seasonSbAttempts: 0,
    ...overrides,
  };
}

const RUNNER = makeRunner();

type Bases = Pick<AtBatState, 'first' | 'second' | 'third'>;

function makeBases(overrides: Partial<Bases> = {}): Bases {
  return {
    first: null,
    second: null,
    third: null,
    ...overrides,
  };
}

describe('BaseDiamond', () => {
  it('renders all empty bases with ◇ symbols', () => {
    const { lastFrame } = render(
      <BaseDiamond first={null} second={null} third={null} />
    );
    const frame = lastFrame() ?? '';
    // Should have three ◇ symbols and no ◆
    const emptyCount = (frame.match(/◇/gu) ?? []).length;
    const occupiedCount = (frame.match(/◆/gu) ?? []).length;
    expect(emptyCount).toBe(3);
    expect(occupiedCount).toBe(0);
  });

  it('renders all occupied bases with ◆ symbols', () => {
    const { lastFrame } = render(
      <BaseDiamond first={RUNNER} second={RUNNER} third={RUNNER} />
    );
    const frame = lastFrame() ?? '';
    const emptyCount = (frame.match(/◇/gu) ?? []).length;
    const occupiedCount = (frame.match(/◆/gu) ?? []).length;
    expect(occupiedCount).toBe(3);
    expect(emptyCount).toBe(0);
  });

  it('renders runner on first only', () => {
    const { lastFrame } = render(
      <BaseDiamond first={RUNNER} second={null} third={null} />
    );
    const frame = lastFrame() ?? '';
    expect((frame.match(/◆/gu) ?? []).length).toBe(1);
    expect((frame.match(/◇/gu) ?? []).length).toBe(2);
  });

  it('renders runner on second only', () => {
    const { lastFrame } = render(
      <BaseDiamond first={null} second={RUNNER} third={null} />
    );
    const frame = lastFrame() ?? '';
    expect((frame.match(/◆/gu) ?? []).length).toBe(1);
    expect((frame.match(/◇/gu) ?? []).length).toBe(2);
  });

  it('renders runner on third only', () => {
    const { lastFrame } = render(
      <BaseDiamond first={null} second={null} third={RUNNER} />
    );
    const frame = lastFrame() ?? '';
    expect((frame.match(/◆/gu) ?? []).length).toBe(1);
    expect((frame.match(/◇/gu) ?? []).length).toBe(2);
  });

  it('renders runners on first and third (corners)', () => {
    const { lastFrame } = render(
      <BaseDiamond first={RUNNER} second={null} third={RUNNER} />
    );
    const frame = lastFrame() ?? '';
    expect((frame.match(/◆/gu) ?? []).length).toBe(2);
    expect((frame.match(/◇/gu) ?? []).length).toBe(1);
  });

  it('renders runners on first and second (double)', () => {
    const { lastFrame } = render(
      <BaseDiamond first={RUNNER} second={RUNNER} third={null} />
    );
    const frame = lastFrame() ?? '';
    expect((frame.match(/◆/gu) ?? []).length).toBe(2);
    expect((frame.match(/◇/gu) ?? []).length).toBe(1);
  });

  it('renders runners on second and third', () => {
    const { lastFrame } = render(
      <BaseDiamond first={null} second={RUNNER} third={RUNNER} />
    );
    const frame = lastFrame() ?? '';
    expect((frame.match(/◆/gu) ?? []).length).toBe(2);
    expect((frame.match(/◇/gu) ?? []).length).toBe(1);
  });

  it('renders the Bases label', () => {
    const { lastFrame } = render(<BaseDiamond {...makeBases()} />);
    expect(lastFrame()).toContain('Bases');
  });

  describe('separator and runner rows', () => {
    it('does not render separator when no bases are occupied', () => {
      const { lastFrame } = render(
        <BaseDiamond first={null} second={null} third={null} />
      );
      expect(lastFrame()).not.toContain('1B');
      expect(lastFrame()).not.toContain('2B');
      expect(lastFrame()).not.toContain('3B');
    });

    it('renders runner name below separator when first is occupied', () => {
      const runner = makeRunner({ fullName: 'Rhys Hoskins' });
      const { lastFrame } = render(
        <BaseDiamond first={runner} second={null} third={null} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('1B');
      expect(frame).toContain('Rhys Hoskins');
    });

    it('renders runner name for second base', () => {
      const runner = makeRunner({ fullName: 'Heliot Ramos' });
      const { lastFrame } = render(
        <BaseDiamond first={null} second={runner} third={null} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('2B');
      expect(frame).toContain('Heliot Ramos');
    });

    it('renders runner name for third base', () => {
      const runner = makeRunner({ fullName: 'Kyle Stowers' });
      const { lastFrame } = render(
        <BaseDiamond first={null} second={null} third={runner} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('3B');
      expect(frame).toContain('Kyle Stowers');
    });

    it('renders SB count without percentage when seasonSbAttempts is 0', () => {
      const runner = makeRunner({
        fullName: 'Fast Runner',
        seasonSb: 12,
        seasonSbAttempts: 0,
      });
      const { lastFrame } = render(
        <BaseDiamond first={runner} second={null} third={null} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('12 SB');
      expect(frame).not.toContain('%');
    });

    it('renders SB count with percentage when seasonSbAttempts > 0', () => {
      const runner = makeRunner({
        fullName: 'Speedy Jones',
        seasonSb: 18,
        seasonSbAttempts: 23, // 18/23 = 78%
      });
      const { lastFrame } = render(
        <BaseDiamond first={runner} second={null} third={null} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('18 SB (78%)');
    });

    it('does not render SB line when seasonSb and seasonSbAttempts are both 0', () => {
      const runner = makeRunner({
        fullName: 'No Steals Player',
        seasonSb: 0,
        seasonSbAttempts: 0,
      });
      const { lastFrame } = render(
        <BaseDiamond first={runner} second={null} third={null} />
      );
      const frame = lastFrame() ?? '';
      // Runner name visible but no SB stat line
      expect(frame).toContain('No Steals Player');
      expect(frame).not.toContain(' SB');
    });

    it('renders all three runner rows when bases are loaded', () => {
      const first = makeRunner({
        fullName: 'Player A',
        seasonSb: 5,
        seasonSbAttempts: 6,
      });
      const second = makeRunner({
        fullName: 'Player B',
        seasonSb: 0,
        seasonSbAttempts: 0,
      });
      const third = makeRunner({
        fullName: 'Player C',
        seasonSb: 20,
        seasonSbAttempts: 25,
      });
      const { lastFrame } = render(
        <BaseDiamond first={first} second={second} third={third} />
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Player A');
      expect(frame).toContain('Player B');
      expect(frame).toContain('Player C');
      expect(frame).toContain('1B');
      expect(frame).toContain('2B');
      expect(frame).toContain('3B');
    });
  });
});
