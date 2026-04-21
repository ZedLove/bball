import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import {
  CelebrationPanel,
  STAGE_BURST_END,
  STAGE_LAUNCH_END,
  TOTAL_FRAMES,
} from './CelebrationPanel.tsx';
import type { CelebrationState } from '../types.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCelebration(
  overrides: Partial<CelebrationState> = {}
): CelebrationState {
  return {
    kind: 'home-run',
    polarity: 'positive',
    frame: 0,
    batterName: 'Aaron Judge',
    expiresAt: Date.now() + 3_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TOTAL_FRAMES sanity check
// ---------------------------------------------------------------------------

describe('CelebrationPanel constants', () => {
  it('TOTAL_FRAMES is positive and stage boundaries are within range', () => {
    expect(TOTAL_FRAMES).toBeGreaterThan(0);
    expect(STAGE_LAUNCH_END).toBeGreaterThan(0);
    expect(STAGE_BURST_END).toBeGreaterThan(STAGE_LAUNCH_END);
    expect(STAGE_BURST_END).toBeLessThan(TOTAL_FRAMES);
  });
});

// ---------------------------------------------------------------------------
// Positive — home run for preferred team
// ---------------------------------------------------------------------------

describe('CelebrationPanel — positive home run', () => {
  it('renders without throwing at frame 0 (launch stage)', () => {
    expect(() =>
      render(<CelebrationPanel celebration={makeCelebration({ frame: 0 })} />)
    ).not.toThrow();
  });

  it('renders without throwing at burst stage', () => {
    expect(() =>
      render(
        <CelebrationPanel
          celebration={makeCelebration({ frame: STAGE_LAUNCH_END })}
        />
      )
    ).not.toThrow();
  });

  it('shows batter name in fade stage', () => {
    const { lastFrame } = render(
      <CelebrationPanel
        celebration={makeCelebration({ frame: STAGE_BURST_END })}
      />
    );
    expect(lastFrame()).toContain('AARON JUDGE');
  });

  it('does not show batter name in launch stage', () => {
    const { lastFrame } = render(
      <CelebrationPanel celebration={makeCelebration({ frame: 0 })} />
    );
    expect(lastFrame()).not.toContain('AARON JUDGE');
  });

  it('renders ★ WIN text for win kind in fade stage', () => {
    const { lastFrame } = render(
      <CelebrationPanel
        celebration={makeCelebration({
          kind: 'win',
          polarity: 'positive',
          batterName: '',
          frame: STAGE_BURST_END,
        })}
      />
    );
    expect(lastFrame()).toContain('WE WIN');
  });
});

// ---------------------------------------------------------------------------
// Negative — opponent HR or loss
// ---------------------------------------------------------------------------

describe('CelebrationPanel — negative (opponent HR)', () => {
  it('renders without throwing at frame 0', () => {
    expect(() =>
      render(
        <CelebrationPanel
          celebration={makeCelebration({ polarity: 'negative' })}
        />
      )
    ).not.toThrow();
  });

  it('shows opponent batter name (lowercase) in fade stage', () => {
    const { lastFrame } = render(
      <CelebrationPanel
        celebration={makeCelebration({
          polarity: 'negative',
          batterName: 'Shohei Ohtani',
          frame: STAGE_BURST_END,
        })}
      />
    );
    expect(lastFrame()).toContain('Shohei Ohtani');
  });

  it('renders loss condolence text for loss kind', () => {
    const { lastFrame } = render(
      <CelebrationPanel
        celebration={makeCelebration({
          kind: 'loss',
          polarity: 'negative',
          batterName: '',
          frame: STAGE_BURST_END,
        })}
      />
    );
    expect(lastFrame()).toContain('Tough loss');
  });
});

// ---------------------------------------------------------------------------
// Frame clamping — last frame should not throw
// ---------------------------------------------------------------------------

describe('CelebrationPanel — frame bounds', () => {
  it('handles frame beyond TOTAL_FRAMES gracefully', () => {
    expect(() =>
      render(
        <CelebrationPanel
          celebration={makeCelebration({ frame: TOTAL_FRAMES + 100 })}
        />
      )
    ).not.toThrow();
  });

  it('handles frame 0 (first frame) gracefully', () => {
    expect(() =>
      render(<CelebrationPanel celebration={makeCelebration({ frame: 0 })} />)
    ).not.toThrow();
  });
});
