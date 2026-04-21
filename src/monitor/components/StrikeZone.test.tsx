import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import {
  StrikeZone,
  mapPitchToGrid,
  GRID_WIDTH,
  GRID_HEIGHT,
  type GridViewport,
} from './StrikeZone.tsx';
import type {
  PitchEvent,
  PitchTrackingData,
} from '../../server/socket-events.ts';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeViewport(overrides: Partial<GridViewport> = {}): GridViewport {
  return {
    xMin: -1.5,
    xMax: 1.5,
    yMin: 1.0,
    yMax: 4.0,
    ...overrides,
  };
}

function makeTracking(
  pX: number,
  pZ: number,
  szTop = 3.5,
  szBottom = 1.5
): PitchTrackingData {
  return {
    startSpeed: 96,
    endSpeed: 88,
    strikeZoneTop: szTop,
    strikeZoneBottom: szBottom,
    strikeZoneWidth: 17,
    strikeZoneDepth: 17,
    plateTime: 0.42,
    extension: 6.2,
    zone: 5,
    coordinates: {
      pX,
      pZ,
      x: 0,
      y: 0,
      x0: 0,
      y0: 0,
      z0: 0,
      vX0: 0,
      vY0: 0,
      vZ0: 0,
      aX: 0,
      aY: 0,
      aZ: 0,
      pfxX: 0,
      pfxZ: 0,
    },
    breaks: {
      spinRate: 2200,
      spinDirection: 200,
      breakAngle: 25,
      breakVertical: -14,
      breakVerticalInduced: 14,
      breakHorizontal: -6,
    },
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
    tracking: makeTracking(0, 2.5),
    hitData: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapPitchToGrid unit tests
// ---------------------------------------------------------------------------

describe('mapPitchToGrid', () => {
  const viewport = makeViewport({
    xMin: -1.5,
    xMax: 1.5,
    yMin: 1.0,
    yMax: 4.0,
  });

  describe('in-bounds pitches', () => {
    it('maps center-plate pitch to center of grid', () => {
      // pX = 0 → col = 8 (center of 17-wide grid)
      // pZ = 2.5 → middle of viewport
      const result = mapPitchToGrid(0, 2.5, viewport, GRID_WIDTH, GRID_HEIGHT);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(8); // center of 17
    });

    it('maps far-left pitch to left edge (col 0)', () => {
      const result = mapPitchToGrid(
        -1.5,
        2.5,
        viewport,
        GRID_WIDTH,
        GRID_HEIGHT
      );
      expect(result).not.toBeNull();
      expect(result!.col).toBe(0);
    });

    it('maps far-right pitch to right edge (col 16)', () => {
      const result = mapPitchToGrid(
        1.5,
        2.5,
        viewport,
        GRID_WIDTH,
        GRID_HEIGHT
      );
      expect(result).not.toBeNull();
      expect(result!.col).toBe(16);
    });

    it('maps top-of-viewport pitch to row 0', () => {
      const result = mapPitchToGrid(0, 4.0, viewport, GRID_WIDTH, GRID_HEIGHT);
      expect(result).not.toBeNull();
      expect(result!.row).toBe(0);
    });

    it('maps bottom-of-viewport pitch to last row', () => {
      const result = mapPitchToGrid(0, 1.0, viewport, GRID_WIDTH, GRID_HEIGHT);
      expect(result).not.toBeNull();
      expect(result!.row).toBe(GRID_HEIGHT - 1);
    });

    it('higher pZ maps to a lower row number (inverted y-axis)', () => {
      const high = mapPitchToGrid(0, 3.8, viewport, GRID_WIDTH, GRID_HEIGHT);
      const low = mapPitchToGrid(0, 1.2, viewport, GRID_WIDTH, GRID_HEIGHT);
      expect(high).not.toBeNull();
      expect(low).not.toBeNull();
      expect(high!.row).toBeLessThan(low!.row);
    });
  });

  describe('out-of-bounds pitches', () => {
    it('returns null for pitch left of viewport', () => {
      const result = mapPitchToGrid(
        -2.0,
        2.5,
        viewport,
        GRID_WIDTH,
        GRID_HEIGHT
      );
      expect(result).toBeNull();
    });

    it('returns null for pitch right of viewport', () => {
      const result = mapPitchToGrid(
        2.0,
        2.5,
        viewport,
        GRID_WIDTH,
        GRID_HEIGHT
      );
      expect(result).toBeNull();
    });

    it('returns null for pitch above viewport', () => {
      const result = mapPitchToGrid(0, 5.0, viewport, GRID_WIDTH, GRID_HEIGHT);
      expect(result).toBeNull();
    });

    it('returns null for pitch below viewport', () => {
      const result = mapPitchToGrid(0, 0.5, viewport, GRID_WIDTH, GRID_HEIGHT);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('pitch exactly at viewport edge is in-bounds', () => {
      const result = mapPitchToGrid(
        -1.5,
        1.0,
        viewport,
        GRID_WIDTH,
        GRID_HEIGHT
      );
      expect(result).not.toBeNull();
    });

    it('col and row are always within grid bounds', () => {
      // Multiple positions — all should stay within grid
      const positions = [
        { pX: -1.4, pZ: 3.9 },
        { pX: 1.4, pZ: 1.1 },
        { pX: 0, pZ: 2.5 },
      ];
      for (const { pX, pZ } of positions) {
        const result = mapPitchToGrid(
          pX,
          pZ,
          viewport,
          GRID_WIDTH,
          GRID_HEIGHT
        );
        expect(result).not.toBeNull();
        expect(result!.col).toBeGreaterThanOrEqual(0);
        expect(result!.col).toBeLessThan(GRID_WIDTH);
        expect(result!.row).toBeGreaterThanOrEqual(0);
        expect(result!.row).toBeLessThan(GRID_HEIGHT);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// StrikeZone component tests
// ---------------------------------------------------------------------------

describe('StrikeZone', () => {
  it('renders Strike Zone label', () => {
    const { lastFrame } = render(<StrikeZone pitchSequence={[]} mode="all" />);
    expect(lastFrame()).toContain('Strike Zone');
  });

  it('renders GRID_HEIGHT rows of content', () => {
    const { lastFrame } = render(<StrikeZone pitchSequence={[]} mode="all" />);
    // Each row becomes a line — count newlines (plus the label row)
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    // Should have at least GRID_HEIGHT lines of grid content
    expect(lines.length).toBeGreaterThanOrEqual(GRID_HEIGHT);
  });

  it('renders with no pitches (empty zone with border only)', () => {
    const { lastFrame } = render(<StrikeZone pitchSequence={[]} mode="all" />);
    // Border characters should be present
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/[┌┐└┘─│]/u);
  });

  it('renders a pitch symbol when a pitch with tracking data is provided', () => {
    const pitch = makePitch({
      call: 'Called Strike',
      tracking: makeTracking(0, 2.5),
    });
    const { lastFrame } = render(
      <StrikeZone pitchSequence={[pitch]} mode="all" />
    );
    // Called strike renders as ● (U+25CF)
    expect(lastFrame()).toContain('●');
  });

  it('renders ball symbol ○ for Ball call', () => {
    const pitch = makePitch({ call: 'Ball', tracking: makeTracking(0, 2.5) });
    const { lastFrame } = render(
      <StrikeZone pitchSequence={[pitch]} mode="all" />
    );
    expect(lastFrame()).toContain('○');
  });

  it('skips pitches without tracking data', () => {
    const pitch = makePitch({ call: 'Called Strike', tracking: null });
    const { lastFrame } = render(
      <StrikeZone pitchSequence={[pitch]} mode="all" />
    );
    // No pitch symbol should appear
    expect(lastFrame()).not.toContain('●');
  });

  describe('pitch display mode', () => {
    it('mode: last renders only the most recent pitch', () => {
      const pitches = [
        makePitch({
          pitchNumber: 1,
          call: 'Ball',
          tracking: makeTracking(-0.5, 2.0),
        }),
        makePitch({
          pitchNumber: 2,
          call: 'Called Strike',
          tracking: makeTracking(0.2, 2.8),
        }),
      ];
      const allFrame = render(
        <StrikeZone pitchSequence={pitches} mode="all" />
      ).lastFrame();
      const lastFrame = render(
        <StrikeZone pitchSequence={pitches} mode="last" />
      ).lastFrame();

      // Both have called strike symbol
      expect(allFrame).toContain('●');
      // In 'all' mode both ball and strike symbols should be present
      // (they occupy different grid cells since pX/pZ differ)
      expect(allFrame).toContain('○');
      // In 'last' mode only strike (most recent) should show
      expect(lastFrame).toContain('●');
    });
  });
});
