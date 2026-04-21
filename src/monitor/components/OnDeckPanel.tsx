import { Box, Text } from 'ink';
import type { AtBatState } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

interface OnDeckPanelProps {
  atBat: AtBatState | null;
}

export function OnDeckPanel({ atBat }: OnDeckPanelProps) {
  if (atBat === null) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.border}
      paddingX={1}
      minWidth={18}
    >
      <Text color={THEME.fgDim}>{'Due Up'}</Text>
      <Text color={THEME.fg}>
        {'OD: '}
        <Text color={atBat.onDeck !== null ? THEME.fg : THEME.fgDim}>
          {atBat.onDeck?.fullName ?? '—'}
        </Text>
      </Text>
      <Text color={THEME.fg}>
        {'IH: '}
        <Text color={atBat.inHole !== null ? THEME.fg : THEME.fgDim}>
          {atBat.inHole?.fullName ?? '—'}
        </Text>
      </Text>
    </Box>
  );
}
