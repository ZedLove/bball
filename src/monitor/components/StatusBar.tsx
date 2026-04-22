import { Box, Text } from 'ink';
import type { FilterMode, PitchDisplayMode } from '../types.ts';
import { THEME } from '../theme.ts';

interface StatusBarProps {
  connectedAt: Date | null;
  filter: FilterMode;
  pitchDisplay: PitchDisplayMode;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function StatusBar({
  connectedAt,
  filter,
  pitchDisplay,
}: StatusBarProps) {
  const connected = connectedAt !== null;
  const statusText = connected
    ? `Connected: ${formatTime(connectedAt)}`
    : 'Disconnected';

  return (
    <Box>
      <Text color={connected ? THEME.connected : THEME.disconnected}>
        {statusText}
      </Text>
      <Text color={THEME.fgDim}>{'  │  Filter: '}</Text>
      <Text color={filter === 'all' ? THEME.keyActive : THEME.keyInactive}>
        {'[a] ALL'}
      </Text>
      <Text color={THEME.fgDim}>{'  '}</Text>
      <Text color={filter === 'scoring' ? THEME.keyActive : THEME.keyInactive}>
        {'[s] Scoring'}
      </Text>
      <Text color={THEME.fgDim}>{'  [p] '}</Text>
      <Text
        color={pitchDisplay === 'last' ? THEME.keyActive : THEME.keyInactive}
      >
        {'last'}
      </Text>
      <Text color={THEME.fgDim}>{' | '}</Text>
      <Text
        color={pitchDisplay === 'at-bat' ? THEME.keyActive : THEME.keyInactive}
      >
        {'at-bat'}
      </Text>
      <Text color={THEME.fgDim}>{' | '}</Text>
      <Text
        color={pitchDisplay === 'all' ? THEME.keyActive : THEME.keyInactive}
      >
        {'all'}
      </Text>
      <Text color={THEME.fgDim}>{'  [q] Quit'}</Text>
    </Box>
  );
}
