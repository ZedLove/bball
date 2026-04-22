import { Box, Text } from 'ink';
import type { BattedBallData } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

// ---------------------------------------------------------------------------
// Grid constants — calibrated from real MLB Statcast data
// A 425ft CF fly ball (coordY=27.53) maps correctly to row 0.
// Home plate (coordY=204) maps to row 17. Foul corners (coordY=88) to row 6.
// ---------------------------------------------------------------------------

export const CHART_W = 30;
export const CHART_H = 18;

// MLB coordinate space bounds (empirically calibrated)
const X_MIN = 11.0; // left foul line
const X_MAX = 240.0; // right foul line
const Y_CF = 28.0; // center field warning track
const Y_PLATE = 204.0; // home plate

// ---------------------------------------------------------------------------
// Coordinate mapping — exported for unit tests
// ---------------------------------------------------------------------------

/** Maps MLB coordX (11–240) to a chart column (0–CHART_W-1). */
export function toChartCol(coordX: number): number {
  return Math.round(((coordX - X_MIN) / (X_MAX - X_MIN)) * (CHART_W - 1));
}

/**
 * Maps MLB coordY (28–204) to a chart row (0–CHART_H-1).
 * Low coordY (outfield) → row 0 (top); high coordY (plate) → row 17 (bottom).
 */
export function toChartRow(coordY: number): number {
  return Math.round(((coordY - Y_CF) / (Y_PLATE - Y_CF)) * (CHART_H - 1));
}

// ---------------------------------------------------------------------------
// Field geometry helpers
// ---------------------------------------------------------------------------

/** Outfield fence row for each column, using a parabola peaking at CF. */
function fenceRow(col: number): number {
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
  coordY: number | null
): FieldCell[][] {
  const grid: FieldCell[][] = Array.from({ length: CHART_H }, () =>
    Array.from({ length: CHART_W }, () => ({
      char: ' ',
      color: 'grass' as const,
    }))
  );

  // Draw outfield fence
  for (let col = 0; col < CHART_W; col++) {
    const row = fenceRow(col);
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
    const col = Math.max(0, Math.min(CHART_W - 1, toChartCol(coordX)));
    const row = Math.max(0, Math.min(CHART_H - 1, toChartRow(coordY)));
    grid[row][col] = { char: '◆', color: 'ball' };
  } else {
    // No coordinates: show a question mark at center field
    const cfRow = toChartRow(Y_CF);
    const cfCol = Math.round((CHART_W - 1) / 2);
    grid[Math.max(0, cfRow)][cfCol] = { char: '?', color: 'miss' };
  }

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
  hitData: BattedBallData;
  isHomeRun: boolean;
}

export function SprayChart({ hitData, isHomeRun }: SprayChartProps) {
  const coordX = hitData.coordinates?.coordX ?? null;
  const coordY = hitData.coordinates?.coordY ?? null;
  const field = buildField(coordX, coordY);

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
