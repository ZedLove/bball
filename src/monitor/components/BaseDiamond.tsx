import { Box, Text } from 'ink';
import type { AtBatState } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

const EMPTY = '◇';
const OCCUPIED = '◆';

interface BaseDiamondProps {
  first: AtBatState['first'];
  second: AtBatState['second'];
  third: AtBatState['third'];
}

/** Formats the season stolen-base stat line for a runner. */
function formatSbStat(seasonSb: number, seasonSbAttempts: number): string {
  if (seasonSbAttempts === 0) return `${String(seasonSb)} SB`;
  const pct = Math.round((seasonSb / seasonSbAttempts) * 100);
  return `${String(seasonSb)} SB (${String(pct)}%)`;
}

export function BaseDiamond({ first, second, third }: BaseDiamondProps) {
  const b1 = first !== null ? OCCUPIED : EMPTY;
  const b2 = second !== null ? OCCUPIED : EMPTY;
  const b3 = third !== null ? OCCUPIED : EMPTY;

  const colorFirst = first !== null ? THEME.baseOccupied : THEME.baseEmpty;
  const colorSecond = second !== null ? THEME.baseOccupied : THEME.baseEmpty;
  const colorThird = third !== null ? THEME.baseOccupied : THEME.baseEmpty;

  const anyRunner = first !== null || second !== null || third !== null;

  // Build ordered runner rows: 1B, 2B, 3B (only occupied bases)
  const runnerRows: Array<{ label: string; runner: AtBatState['first'] }> = [];
  if (first !== null) runnerRows.push({ label: '1B', runner: first });
  if (second !== null) runnerRows.push({ label: '2B', runner: second });
  if (third !== null) runnerRows.push({ label: '3B', runner: third });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.border}
      paddingX={1}
      minWidth={22}
    >
      <Text color={THEME.fgDim}>{'Bases'}</Text>
      {/* Row 1: 2nd base (centered) */}
      <Box>
        <Text>{'  '}</Text>
        <Text color={colorSecond}>{b2}</Text>
      </Box>
      {/* Row 2: 3rd base (left) and 1st base (right) */}
      <Box>
        <Text color={colorThird}>{b3}</Text>
        <Text>{'   '}</Text>
        <Text color={colorFirst}>{b1}</Text>
      </Box>
      {/* Separator and runner details — only when at least one base occupied */}
      {anyRunner && (
        <>
          <Text color={THEME.border}>{'─────────────────'}</Text>
          {runnerRows.map(({ label, runner }) => (
            <Box key={label} flexDirection="column">
              <Text color={THEME.fg}>
                {`${label} `}
                <Text bold>{runner!.fullName}</Text>
              </Text>
              {(runner!.seasonSb > 0 || runner!.seasonSbAttempts > 0) && (
                <Text color={THEME.fgDim}>
                  {'   '}
                  {formatSbStat(runner!.seasonSb, runner!.seasonSbAttempts)}
                </Text>
              )}
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
