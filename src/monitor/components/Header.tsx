import { Box, Text } from 'ink';
import type { GameUpdate } from '../../scheduler/parser.ts';
import { THEME } from '../theme.ts';
import {
  formatScore,
  formatInning,
  formatOuts,
  formatCount,
} from '../formatters/game-formatter.ts';

interface HeaderProps {
  lastUpdate: GameUpdate | null;
}

export function Header({ lastUpdate }: HeaderProps) {
  if (lastUpdate === null) {
    return (
      <Box>
        <Text color={THEME.fgDim}>Waiting for game data…</Text>
      </Box>
    );
  }

  const {
    trackingMode,
    atBat,
    currentPitcher,
    upcomingPitcher,
    inningBreakLength,
    isDelayed,
    delayDescription,
    runsNeeded,
  } = lastUpdate;

  if (trackingMode === 'between-innings') {
    const upcomingName = upcomingPitcher?.fullName ?? 'Unknown';
    return (
      <Box>
        <Text color={THEME.fgDim}>{'⏸  BETWEEN INNINGS'}</Text>
        <Text color={THEME.fgDim}>{'  │  Up next: '}</Text>
        <Text color={THEME.fg}>{upcomingName}</Text>
        {inningBreakLength !== null && (
          <Text color={THEME.fgDim}>{`  │  Break: ${inningBreakLength}s`}</Text>
        )}
      </Box>
    );
  }

  if (trackingMode === 'final') {
    return (
      <Box>
        <Text color={THEME.fgDim}>{'🏁  FINAL'}</Text>
      </Box>
    );
  }

  // outs | batting | runs — normal header
  const pitcherStats =
    currentPitcher !== null && currentPitcher.pitchesThrown > 0
      ? currentPitcher
      : null;

  return (
    <Box>
      <Text color={THEME.fg} bold>
        {formatScore(lastUpdate)}
      </Text>
      <Text color={THEME.fgDim}>{'  │  '}</Text>
      <Text color={THEME.fg}>{formatInning(lastUpdate)}</Text>
      <Text color={THEME.fgDim}>{'  │  '}</Text>
      <Text color={THEME.fg}>{formatOuts(lastUpdate.outs)}</Text>
      {atBat !== null && (
        <>
          <Text color={THEME.fgDim}>{'  │  '}</Text>
          <Text color={THEME.fg}>{formatCount(atBat.count)}</Text>
        </>
      )}
      {currentPitcher !== null && (
        <>
          <Text color={THEME.fgDim}>{'  │  '}</Text>
          <Text color={THEME.fg}>{currentPitcher.fullName}</Text>
          {pitcherStats !== null && (
            <>
              <Text color={THEME.fgDim}>{'  P: '}</Text>
              <Text
                color={THEME.fg}
              >{`${pitcherStats.pitchesThrown} (B-S: ${pitcherStats.balls}-${pitcherStats.strikes})`}</Text>
              {pitcherStats.usage.length > 1 && (
                <Text color={THEME.fgDim}>
                  {'  '}
                  {pitcherStats.usage
                    .map((u) => `${u.typeCode} ${u.pct}%`)
                    .join('  ')}
                </Text>
              )}
            </>
          )}
        </>
      )}
      {trackingMode === 'runs' && (
        <>
          <Text color={THEME.fgDim}>{'  '}</Text>
          <Text color={THEME.scoring}>{'[EXTRAS]'}</Text>
          {runsNeeded !== null && (
            <>
              <Text color={THEME.fgDim}>{'  Need '}</Text>
              <Text
                color={THEME.scoring}
              >{`${runsNeeded} run${runsNeeded !== 1 ? 's' : ''}`}</Text>
            </>
          )}
        </>
      )}
      {isDelayed && delayDescription !== null && (
        <>
          <Text color={THEME.fgDim}>{'  '}</Text>
          <Text
            color={THEME.disconnected}
          >{`[DELAYED: ${delayDescription}]`}</Text>
        </>
      )}
    </Box>
  );
}
