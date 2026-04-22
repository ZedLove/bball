import { Box, Text } from 'ink';
import type {
  BattedBallData,
  VenueFieldInfo,
} from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

// ---------------------------------------------------------------------------
// Grid constants — calibrated from real MLB Statcast data
// A 425ft CF fly ball (coordY=27.53) maps correctly to row 0.
// Home plate (coordY=204) maps to row 17. Foul corners (coordY=88) to row 6.
// ---------------------------------------------------------------------------

export const CHART_W = 30;
export const CHART_H = 18;

// MLB coordinate space bounds (empirically calibrated defaults)
const DEFAULT_X_MIN = 11.0; // left foul line
const DEFAULT_X_MAX = 240.0; // right foul line
const DEFAULT_Y_CF = 28.0; // center field warning track
const DEFAULT_Y_PLATE = 204.0; // home plate

// Pixel-to-feet conversion constants derived from the empirical baseline.
// X: half-span (114.5 units) maps to average foul-line distance (~316 ft).
// Y: (204 - 28 = 176 units) maps to a ~408 ft CF distance.
const X_CENTER_COORD = (DEFAULT_X_MIN + DEFAULT_X_MAX) / 2; // 125.5
const DEFAULT_X_HALF = (DEFAULT_X_MAX - DEFAULT_X_MIN) / 2; // 114.5
// Yankee Stadium used to calibrate: leftLine=318, rightLine=314 → avg=316
const FEET_TO_X_UNITS = DEFAULT_X_HALF / 316;
// Yankee Stadium center=408 → 176 units / 408 ft
const FEET_TO_Y_UNITS = (DEFAULT_Y_PLATE - DEFAULT_Y_CF) / 408;

interface GridBounds {
  xMin: number;
  xMax: number;
  yCf: number;
  yPlate: number;
}

/** Derive grid bounds from venue field info, falling back to hardcoded defaults. */
export function boundsFromVenue(venue: VenueFieldInfo | null): GridBounds {
  if (venue === null) {
    return {
      xMin: DEFAULT_X_MIN,
      xMax: DEFAULT_X_MAX,
      yCf: DEFAULT_Y_CF,
      yPlate: DEFAULT_Y_PLATE,
    };
  }
  const xHalf = ((venue.leftLine + venue.rightLine) / 2) * FEET_TO_X_UNITS;
  const yCf = DEFAULT_Y_PLATE - venue.center * FEET_TO_Y_UNITS;
  return {
    xMin: X_CENTER_COORD - xHalf,
    xMax: X_CENTER_COORD + xHalf,
    yCf,
    yPlate: DEFAULT_Y_PLATE,
  };
}

// ---------------------------------------------------------------------------
// Coordinate mapping — exported for unit tests
// ---------------------------------------------------------------------------

/** Maps MLB coordX to a chart column (0–CHART_W-1) using the given bounds. */
export function toChartCol(
  coordX: number,
  bounds: GridBounds = boundsFromVenue(null)
): number {
  return Math.round(
    ((coordX - bounds.xMin) / (bounds.xMax - bounds.xMin)) * (CHART_W - 1)
  );
}

/**
 * Maps MLB coordY to a chart row (0–CHART_H-1) using the given bounds.
 * Low coordY (outfield) → row 0 (top); high coordY (plate) → row CHART_H-1 (bottom).
 */
export function toChartRow(
  coordY: number,
  bounds: GridBounds = boundsFromVenue(null)
): number {
  return Math.round(
    ((coordY - bounds.yCf) / (bounds.yPlate - bounds.yCf)) * (CHART_H - 1)
  );
}

// ---------------------------------------------------------------------------
// Field geometry helpers
// ---------------------------------------------------------------------------

/**
 * Computes the fence row for each column using the five venue distances.
 * The five anchor points (leftLine, leftCenter, center, rightCenter, rightLine)
 * are placed at evenly distributed columns and linearly interpolated.
 *
 * Row formula: round((1 - dist/centerDist) * (CHART_H - 1))
 * This places the center fence at row 0 and adjusts corners higher (larger row).
 */
export function fenceRowFromVenue(col: number, venue: VenueFieldInfo): number {
  const anchors: Array<{ col: number; dist: number }> = [
    { col: 0, dist: venue.leftLine },
    { col: Math.round((CHART_W - 1) * 0.25), dist: venue.leftCenter },
    { col: Math.round((CHART_W - 1) * 0.5), dist: venue.center },
    { col: Math.round((CHART_W - 1) * 0.75), dist: venue.rightCenter },
    { col: CHART_W - 1, dist: venue.rightLine },
  ];

  // Find surrounding anchor pair
  let lo = anchors[0];
  let hi = anchors[anchors.length - 1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (col >= anchors[i].col && col <= anchors[i + 1].col) {
      lo = anchors[i];
      hi = anchors[i + 1];
      break;
    }
  }

  // Linear interpolation of distance across the column range
  const t = lo.col === hi.col ? 0 : (col - lo.col) / (hi.col - lo.col);
  const dist = lo.dist + t * (hi.dist - lo.dist);
  return Math.max(0, Math.round((1 - dist / venue.center) * (CHART_H - 1)));
}

/** Outfield fence row for each column using a parabola (fallback when no venue data). */
function defaultFenceRow(col: number): number {
  const a = 6.0 / ((CHART_W / 2 - 0.5) * (CHART_W / 2 - 0.5));
  return Math.round(a * (col - (CHART_W - 1) / 2) ** 2);
}

// ---------------------------------------------------------------------------
// Field position labels — overlaid on the chart
// Labels are placed at known positions on the grid.
// ---------------------------------------------------------------------------

interface FieldLabel {
  col: number;
  row: number;
  char: string;
}

const FIELD_LABELS: FieldLabel[] = [
  // 2B: sits between CF and home plate, near center
  { col: 14, row: 7, char: '<' },
  { col: 15, row: 7, char: '>' },
  // 1B: right side
  { col: 20, row: 9, char: '<' },
  { col: 21, row: 9, char: '>' },
  // 3B: left side
  { col: 8, row: 9, char: '<' },
  { col: 9, row: 9, char: '>' },
  // Pitcher's mound
  { col: 14, row: 12, char: '○' },
  // Home plate
  { col: 14, row: 16, char: 'H' },
  { col: 15, row: 16, char: 'P' },
];

// ---------------------------------------------------------------------------
// buildField — returns the 2D char array with the ball overlaid
// ---------------------------------------------------------------------------

interface FieldCell {
  char: string;
  color: 'fence' | 'foul' | 'label' | 'ball' | 'miss' | 'grass';
}

export function buildField(
  coordX: number | null,
  coordY: number | null,
  venue: VenueFieldInfo | null = null
): FieldCell[][] {
  const bounds = boundsFromVenue(venue);
  const grid: FieldCell[][] = Array.from({ length: CHART_H }, () =>
    Array.from({ length: CHART_W }, () => ({
      char: ' ',
      color: 'grass' as const,
    }))
  );

  // Draw outfield fence
  for (let col = 0; col < CHART_W; col++) {
    const row =
      venue !== null ? fenceRowFromVenue(col, venue) : defaultFenceRow(col);
    if (row >= 0 && row < CHART_H) {
      grid[row][col] = { char: '~', color: 'fence' };
    }
  }

  // Draw foul lines (only in the region between the foul corners and home plate)
  const plateCol = (CHART_W - 1) / 2;
  const plateRow = CHART_H - 1;
  const cornerRow = 6;

  for (let row = cornerRow; row <= plateRow; row++) {
    // Left foul line
    const leftSlope = (plateRow - cornerRow) / (plateCol - 0);
    const leftCol = Math.round(plateCol - (plateRow - row) / leftSlope);
    if (leftCol >= 0 && leftCol < CHART_W && grid[row][leftCol].char === ' ') {
      grid[row][leftCol] = { char: '/', color: 'foul' };
    }
    // Right foul line
    const rightSlope = (plateRow - cornerRow) / (plateCol - (CHART_W - 1));
    const rightCol = Math.round(plateCol - (plateRow - row) / rightSlope);
    if (
      rightCol >= 0 &&
      rightCol < CHART_W &&
      grid[row][rightCol].char === ' '
    ) {
      grid[row][rightCol] = { char: '\\', color: 'foul' };
    }
  }

  // Draw field position labels
  for (const label of FIELD_LABELS) {
    if (
      label.row >= 0 &&
      label.row < CHART_H &&
      label.col >= 0 &&
      label.col < CHART_W
    ) {
      grid[label.row][label.col] = { char: label.char, color: 'label' };
    }
  }

  // Place the ball marker
  if (coordX !== null && coordY !== null) {
    const col = Math.max(0, Math.min(CHART_W - 1, toChartCol(coordX, bounds)));
    const row = Math.max(0, Math.min(CHART_H - 1, toChartRow(coordY, bounds)));
    grid[row][col] = { char: '◆', color: 'ball' };
  }
  // When coordinates are absent, leave the field diagram clean (no marker).

  return grid;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function cellColor(
  color: FieldCell['color'],
  isHomeRun: boolean
): string | undefined {
  switch (color) {
    case 'ball':
      return isHomeRun ? THEME.homeRun : THEME.zoneInPlay;
    case 'fence':
      return THEME.border;
    case 'foul':
      return THEME.fgDim;
    case 'label':
      return THEME.fgDim;
    case 'miss':
      return THEME.fgDim;
    default:
      return undefined;
  }
}

interface SprayChartProps {
  hitData: BattedBallData | null;
  isHomeRun: boolean;
  venueFieldInfo?: VenueFieldInfo | null;
}

export function SprayChart({
  hitData,
  isHomeRun,
  venueFieldInfo = null,
}: SprayChartProps) {
  const coordX = hitData?.coordinates?.coordX ?? null;
  const coordY = hitData?.coordinates?.coordY ?? null;
  const field = buildField(coordX, coordY, venueFieldInfo);

  return (
    <Box flexDirection="column">
      {field.map((rowCells, rowIdx) => (
        <Box key={rowIdx} flexDirection="row">
          {rowCells.map((cell, colIdx) => (
            <Text key={colIdx} color={cellColor(cell.color, isHomeRun)}>
              {cell.char}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
