import { Box, Text } from 'ink';
import type { PitchEvent } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';
import { abbreviateCall } from '../formatters/pitch-formatter.ts';

const STRIKE_CALLS = new Set(['CS', 'SS', 'SS(B)', 'AS']);
const BALL_CALLS = new Set(['B', 'IB', 'AB', 'PO']);
const FOUL_CALLS = new Set(['F', 'FT', 'FB', 'FP', 'MB']);
const IN_PLAY_CALLS = new Set(['IP', 'IP(O)', 'IP(R)']);

function getPitchColor(callAbbrev: string): string {
  if (STRIKE_CALLS.has(callAbbrev)) return THEME.zoneStrike;
  if (BALL_CALLS.has(callAbbrev)) return THEME.zoneBall;
  if (FOUL_CALLS.has(callAbbrev)) return THEME.zoneFoul;
  if (IN_PLAY_CALLS.has(callAbbrev)) return THEME.zoneInPlay;
  return THEME.fgDim;
}

function formatPitchLine(pitch: PitchEvent): string {
  const code = pitch.pitchTypeCode ?? pitch.pitchType;
  const speed = pitch.speedMph !== null ? `${pitch.speedMph}mph` : '??mph';
  const call = abbreviateCall(pitch.call);
  return `${code} ${speed} ${call}`;
}

const MAX_PITCH_LINES = 10;

interface PitchSequenceProps {
  pitchSequence: PitchEvent[];
  mode: 'all' | 'last';
}

export function PitchSequence({ pitchSequence, mode }: PitchSequenceProps) {
  if (pitchSequence.length === 0) {
    return null;
  }

  let pitchesToRender: PitchEvent[];
  if (mode === 'last') {
    pitchesToRender = [pitchSequence[pitchSequence.length - 1]];
  } else {
    // Cap at MAX_PITCH_LINES — drop oldest (from the front)
    pitchesToRender = pitchSequence.slice(-MAX_PITCH_LINES);
  }

  return (
    <Box flexDirection="column">
      {pitchesToRender.map((pitch) => {
        const callAbbrev = abbreviateCall(pitch.call);
        const color = getPitchColor(callAbbrev);
        return (
          <Text key={pitch.pitchNumber} color={color}>
            {formatPitchLine(pitch)}
          </Text>
        );
      })}
    </Box>
  );
}
