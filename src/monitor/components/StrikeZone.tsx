import { Box, Text } from 'ink';
import type { PitchEvent } from '../../server/socket-events.ts';
import type { PitchDisplayMode } from '../types.ts';
import { THEME } from '../theme.ts';
import { abbreviateCall } from '../formatters/pitch-formatter.ts';

// ---------------------------------------------------------------------------
// Grid constants — start at 14 rows, tuned during manual testing
// ---------------------------------------------------------------------------

export const GRID_WIDTH = 25;
export const GRID_HEIGHT = 14;

// Viewport in feet — horizontal extends ±1.5ft from center; vertical adds
// 0.5ft padding beyond the per-batter strike zone bounds.
const VIEWPORT_X_HALF = 1.5; // feet, ±
const VIEWPORT_Y_PAD = 0.5; // feet, above/below zone bounds

// Default strike zone bounds used when tracking data is absent (MLB average).
const DEFAULT_SZ_TOP = 3.5;
const DEFAULT_SZ_BOTTOM = 1.5;

// ---------------------------------------------------------------------------
// Pitch symbol helpers
// ---------------------------------------------------------------------------

const STRIKE_CALLS = new Set(['CS', 'SS', 'SS(B)', 'AS']);
const BALL_CALLS = new Set(['B', 'IB', 'AB', 'PO', 'BID']);
const FOUL_CALLS = new Set(['F', 'FT', 'FB', 'FP', 'MB']);
const IN_PLAY_CALLS = new Set(['IP', 'IP(O)', 'IP(R)']);

function getPitchSymbol(callAbbrev: string): string {
  if (STRIKE_CALLS.has(callAbbrev)) return '\u25CF';
  if (BALL_CALLS.has(callAbbrev)) return '\u25CB';
  if (FOUL_CALLS.has(callAbbrev)) return '\u25C6';
  if (IN_PLAY_CALLS.has(callAbbrev)) return '\u2605';
  return '\u00B7';
}

function getPitchSymbolColor(callAbbrev: string): string {
  if (STRIKE_CALLS.has(callAbbrev)) return THEME.zoneStrike;
  if (BALL_CALLS.has(callAbbrev)) return THEME.zoneBall;
  if (FOUL_CALLS.has(callAbbrev)) return THEME.zoneFoul;
  if (IN_PLAY_CALLS.has(callAbbrev)) return THEME.zoneInPlay;
  return THEME.fgDim;
}

// ---------------------------------------------------------------------------
// mapPitchToGrid — pure function, exported for unit tests
// ---------------------------------------------------------------------------

export interface GridViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function mapPitchToGrid(
  pX: number,
  pZ: number,
  viewport: GridViewport,
  gridWidth: number,
  gridHeight: number
): { col: number; row: number } | null {
  const { xMin, xMax, yMin, yMax } = viewport;

  // Out of viewport bounds
  if (pX < xMin || pX > xMax || pZ < yMin || pZ > yMax) {
    return null;
  }

  // Map to grid coordinates — pZ is inverted (high pZ = top of zone = row 0)
  const col = Math.round(((pX - xMin) / (xMax - xMin)) * (gridWidth - 1));
  const row = Math.round(((yMax - pZ) / (yMax - yMin)) * (gridHeight - 1));

  // Clamp to grid bounds
  const clampedCol = Math.max(0, Math.min(gridWidth - 1, col));
  const clampedRow = Math.max(0, Math.min(gridHeight - 1, row));

  return { col: clampedCol, row: clampedRow };
}

// ---------------------------------------------------------------------------
// Zone border drawing
// ---------------------------------------------------------------------------

interface ZoneCell {
  char: string;
  color: string;
}

type Grid = (ZoneCell | null)[][];

function makeEmptyGrid(): Grid {
  return Array.from({ length: GRID_HEIGHT }, () =>
    Array.from({ length: GRID_WIDTH }, () => null)
  );
}

function drawZoneBorder(
  grid: Grid,
  zoneColMin: number,
  zoneColMax: number,
  zoneRowMin: number,
  zoneRowMax: number
): void {
  const borderCell = (char: string): ZoneCell => ({
    char,
    color: THEME.zoneBorder,
  });

  for (let c = zoneColMin; c <= zoneColMax; c++) {
    const topRow = grid[zoneRowMin];
    const botRow = grid[zoneRowMax];
    if (topRow && topRow[c] === null) {
      topRow[c] = borderCell(
        c === zoneColMin ? '\u250C' : c === zoneColMax ? '\u2510' : '\u2500'
      );
    }
    if (botRow && botRow[c] === null) {
      botRow[c] = borderCell(
        c === zoneColMin ? '\u2514' : c === zoneColMax ? '\u2518' : '\u2500'
      );
    }
  }

  for (let r = zoneRowMin + 1; r < zoneRowMax; r++) {
    const row = grid[r];
    if (row) {
      if (row[zoneColMin] === null) row[zoneColMin] = borderCell('\u2502');
      if (row[zoneColMax] === null) row[zoneColMax] = borderCell('\u2502');
    }
  }
}

// ---------------------------------------------------------------------------
// StrikeZone component — pure render, no side effects.
// Persistence (showing last at-bat's pitches between plate appearances) is
// the caller's responsibility via app.tsx useRef.
// ---------------------------------------------------------------------------

interface StrikeZoneProps {
  /** Pitches to render in the zone. Empty array = empty zone with border only. */
  pitchSequence: PitchEvent[];
  /** Pitch display toggle: 'last' = most recent only; 'at-bat'/'all' = all pitches in sequence. */
  mode: PitchDisplayMode;
  /** Strike zone top bound in feet (batter-specific). */
  szTop?: number;
  /** Strike zone bottom bound in feet (batter-specific). */
  szBottom?: number;
}

export function StrikeZone({
  pitchSequence,
  mode,
  szTop = DEFAULT_SZ_TOP,
  szBottom = DEFAULT_SZ_BOTTOM,
}: StrikeZoneProps) {
  // Viewport — horizontal: ±1.5ft; vertical: szBottom−pad to szTop+pad
  const viewport: GridViewport = {
    xMin: -VIEWPORT_X_HALF,
    xMax: VIEWPORT_X_HALF,
    yMin: szBottom - VIEWPORT_Y_PAD,
    yMax: szTop + VIEWPORT_Y_PAD,
  };

  // Map zone border to grid coordinates
  const zoneXHalf = 1.417 / 2; // 17 inches = ~0.708ft either side
  const zoneLeft = mapPitchToGrid(
    -zoneXHalf,
    szTop,
    viewport,
    GRID_WIDTH,
    GRID_HEIGHT
  );
  const zoneRight = mapPitchToGrid(
    zoneXHalf,
    szBottom,
    viewport,
    GRID_WIDTH,
    GRID_HEIGHT
  );

  const grid = makeEmptyGrid();

  if (zoneLeft && zoneRight) {
    drawZoneBorder(
      grid,
      zoneLeft.col,
      zoneRight.col,
      zoneLeft.row,
      zoneRight.row
    );
  }

  // Determine which pitches to plot based on mode
  const pitchesForPlot =
    mode === 'last' && pitchSequence.length > 0
      ? [pitchSequence[pitchSequence.length - 1]]
      : pitchSequence;

  // Place pitch symbols — most recent pitch wins on collision
  for (const pitch of pitchesForPlot) {
    if (pitch.tracking === null) continue;
    const { pX, pZ } = pitch.tracking.coordinates;
    const pos = mapPitchToGrid(pX, pZ, viewport, GRID_WIDTH, GRID_HEIGHT);
    if (pos === null) continue;
    const callAbbrev = abbreviateCall(pitch.call);
    const row = grid[pos.row];
    if (row) {
      row[pos.col] = {
        char: getPitchSymbol(callAbbrev),
        color: getPitchSymbolColor(callAbbrev),
      };
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={THEME.fgDim}>{'Strike Zone'}</Text>
      {grid.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {row.map((cell, colIdx) => (
            <Text key={colIdx} color={cell?.color ?? THEME.fgDim}>
              {cell?.char ?? ' '}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
