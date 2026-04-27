import { Box, Text } from 'ink';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
} from '../../server/socket-events.ts';
import type { GameUpdate } from '../../server/socket-events.ts';
import type { FilterMode } from '../types.ts';
import { MAX_EVENTS } from '../types.ts';
import { THEME } from '../theme.ts';
import { EventLine } from './EventLine.tsx';

interface EventsPanelProps {
  lastUpdate: GameUpdate | null;
  events: GameEvent[];
  filter: FilterMode;
}

function applyFilter(events: GameEvent[], filter: FilterMode): GameEvent[] {
  if (filter === 'all') return events;
  return events.filter((event) => {
    if (event.category !== 'plate-appearance-completed') return true;
    return (event as PlateAppearanceCompletedEvent).isScoringPlay;
  });
}

export function EventsPanel({ lastUpdate, events, filter }: EventsPanelProps) {
  if (lastUpdate === null) {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Text color={THEME.fgDim}>Waiting for game data…</Text>
      </Box>
    );
  }

  const filtered = applyFilter(events, filter);

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text
        color={THEME.fgDim}
      >{`Recent game-events (last ${MAX_EVENTS}):`}</Text>
      <Text color={THEME.border}>{'─'.repeat(60)}</Text>
      {filtered.map((event, i) => (
        <EventLine
          key={`${event.gamePk}-${event.atBatIndex}-${i}`}
          event={event}
        />
      ))}
    </Box>
  );
}
