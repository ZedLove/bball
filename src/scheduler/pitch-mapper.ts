import type { PlayEvent } from './game-feed-types.ts';
import type {
  PitchEvent,
  PitchTrackingData,
  BattedBallData,
} from '../server/socket-events.ts';

/**
 * Maps a single raw pitch play event to the `PitchEvent` domain type.
 * Only call this for events where `type === "pitch"`.
 */
export function mapPitchEvent(pe: PlayEvent): PitchEvent {
  const pd = pe.pitchData;
  const tracking: PitchTrackingData | null = pd
    ? {
        startSpeed: pd.startSpeed,
        endSpeed: pd.endSpeed,
        strikeZoneTop: pd.strikeZoneTop,
        strikeZoneBottom: pd.strikeZoneBottom,
        strikeZoneWidth: pd.strikeZoneWidth,
        strikeZoneDepth: pd.strikeZoneDepth,
        plateTime: pd.plateTime,
        extension: pd.extension,
        zone: pd.zone,
        coordinates: { ...pd.coordinates },
        breaks: { ...pd.breaks },
      }
    : null;

  const hd = pe.hitData ?? null;
  const hitData: BattedBallData | null = hd
    ? {
        launchSpeed: hd.launchSpeed,
        launchAngle: hd.launchAngle,
        totalDistance: hd.totalDistance,
        trajectory: hd.trajectory,
        hardness: hd.hardness,
        location: hd.location,
        coordinates: hd.coordinates,
      }
    : null;

  return {
    pitchNumber: pe.pitchNumber ?? 0,
    pitchType: pe.details.type?.description ?? 'Unknown',
    pitchTypeCode: pe.details.type?.code ?? null,
    call: pe.details.description,
    isBall: pe.details.isBall ?? false,
    isStrike: pe.details.isStrike ?? false,
    isInPlay: pe.details.isInPlay ?? false,
    speedMph: pd?.startSpeed ?? null,
    countAfter: {
      balls: pe.count?.balls ?? 0,
      strikes: pe.count?.strikes ?? 0,
    },
    tracking,
    hitData,
  };
}
