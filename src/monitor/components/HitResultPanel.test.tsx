import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { HitResultPanel } from './HitResultPanel.tsx';
import type { HitDisplay } from '../types.ts';
import type { BattedBallData } from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeHitData(overrides: Partial<BattedBallData> = {}): BattedBallData {
  return {
    launchSpeed: 107.4,
    launchAngle: 28.0,
    totalDistance: 425,
    trajectory: 'fly_ball',
    hardness: 'hard',
    location: '8',
    coordinates: { coordX: 113.48, coordY: 27.53 },
    ...overrides,
  };
}

function makeHit(overrides: Partial<HitDisplay> = {}): HitDisplay {
  return {
    hitData: makeHitData(),
    batter: { id: 660271, fullName: 'Aaron Judge' },
    eventType: 'Home Run',
    isHomeRun: true,
    expiresAt: Date.now() + 15_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HitResultPanel', () => {
  it('renders batter name', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    expect(lastFrame()).toContain('Aaron Judge');
  });

  it('renders event type in header', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    expect(lastFrame()).toContain('Home Run');
  });

  it('formats trajectory as title case', () => {
    const { lastFrame } = render(
      <HitResultPanel
        lastHit={makeHit({ eventType: 'Fly Out', isHomeRun: false })}
      />
    );
    expect(lastFrame()).toContain('Fly Ball');
  });

  it('renders total distance in feet', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    expect(lastFrame()).toContain('425');
    expect(lastFrame()).toContain('ft');
  });

  it('renders exit velocity', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    expect(lastFrame()).toContain('107.4');
    expect(lastFrame()).toContain('mph');
  });

  it('renders launch angle', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    expect(lastFrame()).toContain('28.0');
    expect(lastFrame()).toContain('°');
  });

  it('renders contact hardness', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    expect(lastFrame()).toContain('Hard');
  });

  it('omits exit velocity when launchSpeed is null', () => {
    const { lastFrame } = render(
      <HitResultPanel
        lastHit={makeHit({ hitData: makeHitData({ launchSpeed: null }) })}
      />
    );
    expect(lastFrame()).not.toContain('mph');
  });

  it('omits launch angle when launchAngle is null', () => {
    const { lastFrame } = render(
      <HitResultPanel
        lastHit={makeHit({ hitData: makeHitData({ launchAngle: null }) })}
      />
    );
    expect(lastFrame()).not.toContain('Launch Angle');
  });

  it('omits distance from header when totalDistance is null', () => {
    const { lastFrame } = render(
      <HitResultPanel
        lastHit={makeHit({ hitData: makeHitData({ totalDistance: null }) })}
      />
    );
    expect(lastFrame()).not.toContain(' ft');
  });

  it('shows no spray chart data notice when coordinates are null', () => {
    const { lastFrame } = render(
      <HitResultPanel
        lastHit={makeHit({ hitData: makeHitData({ coordinates: null }) })}
      />
    );
    expect(lastFrame()).toContain('No spray chart data');
  });

  it('renders non-home-run event correctly', () => {
    const { lastFrame } = render(
      <HitResultPanel
        lastHit={makeHit({
          eventType: 'Double',
          isHomeRun: false,
          batter: { id: 1, fullName: 'Freddie Freeman' },
        })}
      />
    );
    expect(lastFrame()).toContain('Double');
    expect(lastFrame()).toContain('Freddie Freeman');
  });

  it('renders the spray chart grid (18 rows)', () => {
    const { lastFrame } = render(<HitResultPanel lastHit={makeHit()} />);
    // The chart itself is 18 rows tall — its output will include newlines.
    const lines = (lastFrame() ?? '').split('\n');
    // Allow for top-level box + chart rows
    expect(lines.length).toBeGreaterThanOrEqual(18);
  });

  describe('lastHit === null (empty state)', () => {
    it('renders the field diagram without throwing', () => {
      expect(() => render(<HitResultPanel lastHit={null} />)).not.toThrow();
    });

    it('renders CHART_H lines (field always visible)', () => {
      const { lastFrame } = render(<HitResultPanel lastHit={null} />);
      const lines = (lastFrame() ?? '').split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(18);
    });

    it('does not render batter name or stats when lastHit is null', () => {
      const { lastFrame } = render(<HitResultPanel lastHit={null} />);
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('mph');
      expect(frame).not.toContain('Exit Velocity');
    });
  });
});
