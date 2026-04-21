import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import {
  CHART_H,
  CHART_W,
  buildField,
  SprayChart,
  toChartCol,
  toChartRow,
} from './SprayChart.tsx';
import type { BattedBallData } from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeHitData(overrides: Partial<BattedBallData> = {}): BattedBallData {
  return {
    launchSpeed: 107.4,
    launchAngle: 28,
    totalDistance: 425,
    trajectory: 'fly_ball',
    hardness: 'hard',
    location: '8',
    coordinates: { coordX: 113.48, coordY: 27.53 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

describe('toChartCol', () => {
  it('maps left foul boundary to col 0', () => {
    expect(toChartCol(11)).toBe(0);
  });

  it('maps right foul boundary to col CHART_W-1', () => {
    expect(toChartCol(240)).toBe(CHART_W - 1);
  });

  it('maps center (coordX=125) to approximately the middle column', () => {
    const col = toChartCol(125);
    expect(col).toBeGreaterThanOrEqual(14);
    expect(col).toBeLessThanOrEqual(15);
  });
});

describe('toChartRow', () => {
  it('maps CF (coordY=28) to row 0 (top)', () => {
    expect(toChartRow(28)).toBe(0);
  });

  it('maps home plate (coordY=204) to row CHART_H-1 (bottom)', () => {
    expect(toChartRow(204)).toBe(CHART_H - 1);
  });

  it('maps foul corner depth (coordY=88) to approximately row 6', () => {
    const row = toChartRow(88);
    expect(row).toBeGreaterThanOrEqual(5);
    expect(row).toBeLessThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// buildField
// ---------------------------------------------------------------------------

describe('buildField', () => {
  it('returns a grid with CHART_H rows and CHART_W columns', () => {
    const field = buildField(113.48, 27.53);
    expect(field).toHaveLength(CHART_H);
    for (const row of field) {
      expect(row).toHaveLength(CHART_W);
    }
  });

  it('places the ball marker at the correct position for the calibration point (CF 425ft)', () => {
    // coordX=113.48, coordY=27.53 → col=13, row=0
    const field = buildField(113.48, 27.53);
    const ballCell = field[0][13];
    expect(ballCell.char).toBe('◆');
    expect(ballCell.color).toBe('ball');
  });

  it('places a question mark at center field when coordinates are null', () => {
    const field = buildField(null, null);
    const row0 = field[0];
    const hasQuestionMark = row0.some((c) => c.char === '?');
    expect(hasQuestionMark).toBe(true);
  });

  it('clamps ball position to grid bounds', () => {
    // Extreme out-of-range coordinates should not throw
    expect(() => buildField(-999, -999)).not.toThrow();
    expect(() => buildField(9999, 9999)).not.toThrow();
  });

  it('includes outfield fence cells (~)', () => {
    const field = buildField(null, null);
    const hasFence = field
      .flat()
      .some((c) => c.char === '~' && c.color === 'fence');
    expect(hasFence).toBe(true);
  });

  it('includes at least one field position label (2B, 3B, etc.)', () => {
    const field = buildField(null, null);
    const hasLabel = field.flat().some((c) => c.color === 'label');
    expect(hasLabel).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SprayChart component
// ---------------------------------------------------------------------------

describe('SprayChart', () => {
  it('renders CHART_H lines', () => {
    const { lastFrame } = render(
      <SprayChart hitData={makeHitData()} isHomeRun={false} />
    );
    const lines = (lastFrame() ?? '').split('\n');
    expect(lines).toHaveLength(CHART_H);
  });

  it('includes the ball marker character in the rendered output', () => {
    const { lastFrame } = render(
      <SprayChart hitData={makeHitData()} isHomeRun={false} />
    );
    expect(lastFrame()).toContain('◆');
  });

  it('renders a question mark when coordinates are null', () => {
    const { lastFrame } = render(
      <SprayChart
        hitData={makeHitData({ coordinates: null })}
        isHomeRun={false}
      />
    );
    expect(lastFrame()).toContain('?');
    expect(lastFrame()).not.toContain('◆');
  });

  it('renders without throwing for a home run', () => {
    expect(() =>
      render(<SprayChart hitData={makeHitData()} isHomeRun={true} />)
    ).not.toThrow();
  });
});
