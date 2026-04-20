import type { PlayEvent } from './game-feed-types.ts';
import type { PitchEvent } from '../server/socket-events.ts';

/**
 * Maps a single raw pitch play event to the `PitchEvent` domain type.
 * Only call this for events where `type === "pitch"`.
 */
export function mapPitchEvent(pe: PlayEvent): PitchEvent {
  return {
    pitchNumber: pe.pitchNumber ?? 0,
    pitchType: pe.details.type?.description ?? 'Unknown',
    pitchTypeCode: null,
    call: pe.details.description,
    isBall: pe.details.isBall ?? false,
    isStrike: pe.details.isStrike ?? false,
    isInPlay: pe.details.isInPlay ?? false,
    speedMph: pe.pitchData?.startSpeed ?? null,
    countAfter: {
      balls: pe.count?.balls ?? 0,
      strikes: pe.count?.strikes ?? 0,
    },
    tracking: null,
    hitData: null,
  };
}
