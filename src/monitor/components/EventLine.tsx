import { Box, Text } from 'ink';
import type {
  GameEvent,
  PlateAppearanceCompletedEvent,
} from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';
import {
  formatEventLine,
  formatInningTag,
} from '../formatters/event-formatter.ts';

const BASERUNNING_TYPES = new Set([
  'stolen_base_2b',
  'stolen_base_3b',
  'stolen_base_home',
  'caught_stealing_2b',
  'caught_stealing_3b',
  'caught_stealing_home',
  'pickoff_1b',
  'pickoff_2b',
  'pickoff_3b',
  'pickoff_caught_stealing_2b',
  'pickoff_caught_stealing_3b',
  'pickoff_caught_stealing_home',
  'wild_pitch',
  'passed_ball',
  'balk',
]);

function getEventColor(event: GameEvent): string {
  if (event.category !== 'plate-appearance-completed') {
    return THEME.substitution;
  }
  const pa = event as PlateAppearanceCompletedEvent;
  if (pa.eventType === 'home_run') return THEME.homeRun;
  if (pa.isScoringPlay) return THEME.scoring;
  if (
    pa.eventType === 'strikeout' ||
    pa.eventType === 'strikeout_double_play'
  ) {
    return THEME.strikeout;
  }
  if (BASERUNNING_TYPES.has(pa.eventType)) return THEME.baserunning;
  return THEME.neutral;
}

interface EventLineProps {
  event: GameEvent;
}

export function EventLine({ event }: EventLineProps) {
  const color = getEventColor(event);
  const { icon, label } = formatEventLine(event);
  const tag = formatInningTag(event.inning, event.halfInning);

  return (
    <Box>
      <Text color={THEME.fgDim}>{tag} </Text>
      <Text>{icon} </Text>
      <Text color={color}>{label}</Text>
    </Box>
  );
}
