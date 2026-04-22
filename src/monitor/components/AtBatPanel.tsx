import { Box, Text } from 'ink';
import type { AtBatState } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';
import type { PitchDisplayMode } from '../types.ts';
import { PitchSequence } from './PitchSequence.tsx';
import { formatCount } from '../formatters/game-formatter.ts';

interface AtBatPanelProps {
  atBat: AtBatState | null;
  pitchDisplay: PitchDisplayMode;
}

export function AtBatPanel({ atBat, pitchDisplay }: AtBatPanelProps) {
  if (atBat === null) {
    return null;
  }

  const batterLabel = `${atBat.batter.fullName} (${atBat.batSide})`;
  const pitcherLabel = `vs ${atBat.pitcher.fullName} (${atBat.pitchHand})`;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.border}
      paddingX={1}
      width={36}
    >
      <Text color={THEME.fgDim}>{'At-Bat'}</Text>
      <Text color={THEME.fg}>{batterLabel}</Text>
      <Text color={THEME.fgDim}>{pitcherLabel}</Text>
      <Text color={THEME.fg}>{`Count: ${formatCount(atBat.count)}`}</Text>
      <PitchSequence pitchSequence={atBat.pitchSequence} mode={pitchDisplay} />
    </Box>
  );
}
