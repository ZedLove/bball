import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { BaseDiamond } from './BaseDiamond.tsx';
import type { AtBatState } from '../../server/socket-events.ts';

const RUNNER = { id: 1, fullName: 'Test Runner' };

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
});
