import { Box, Text } from 'ink';
import type { AtBatState, LineupEntry } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

interface LineupPanelProps {
  atBat: AtBatState | null;
}

/** Formats the stat suffix for a lineup entry. */
function formatStat(entry: LineupEntry): string {
  if (entry.atBats > 0) {
    return `  ${String(entry.hits)}-${String(entry.atBats)}`;
  }
  if (entry.seasonOps !== null) {
    return `  ${entry.seasonOps} OPS`;
  }
  return '';
}

export function LineupPanel({ atBat }: LineupPanelProps) {
  if (atBat === null) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={THEME.border}
        paddingX={1}
      >
        <Text color={THEME.fgDim}>{'Lineup'}</Text>
      </Box>
    );
  }

  const { lineup, batter, onDeck, inHole, batSide } = atBat;

  if (lineup.length === 0) return null;

  const sorted = [...lineup].sort((a, b) => a.battingOrder - b.battingOrder);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.border}
      paddingX={1}
    >
      <Text color={THEME.fgDim}>{'Lineup'}</Text>
      {sorted.map((entry) => {
        const slot = Math.floor(entry.battingOrder / 100);
        const isCurrent = entry.id === batter.id;
        const isOnDeck =
          !isCurrent && onDeck !== null && entry.id === onDeck.id;
        const isInHole =
          !isCurrent && !isOnDeck && inHole !== null && entry.id === inHole.id;

        const handedness = isCurrent ? ` (${batSide})` : '';

        let suffix = '';
        if (isOnDeck) suffix = ' (OD)';
        else if (isInHole) suffix = ' (IH)';

        const statSuffix = formatStat(entry);

        const color = isCurrent
          ? THEME.fgBright
          : isOnDeck || isInHole
            ? THEME.fg
            : THEME.fgDim;

        const bold = isCurrent;

        return (
          <Text key={entry.id} color={color} bold={bold}>
            {`${String(slot)}. ${entry.fullName}${handedness}${suffix}${statSuffix}`}
          </Text>
        );
      })}
    </Box>
  );
}
