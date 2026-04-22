import axios from 'axios';
import { logger } from '../config/logger.ts';

const MLB_VENUES_ENDPOINT = 'https://statsapi.mlb.com/api/v1/venues';

export interface VenueFieldInfo {
  venueId: number;
  leftLine: number;
  leftCenter: number;
  center: number;
  rightCenter: number;
  rightLine: number;
}

interface VenueApiResponse {
  venues: Array<{
    id: number;
    fieldInfo?: {
      leftLine?: number;
      leftCenter?: number;
      center?: number;
      rightCenter?: number;
      rightLine?: number;
    };
  }>;
}

/**
 * Fetches venue field info from the MLB Stats API.
 * Results are cached per venueId for the lifetime of the process.
 * Returns null on any error or missing data — callers must treat null as
 * "use fallback constants".
 */
export class VenueClient {
  private readonly cache = new Map<number, VenueFieldInfo>();

  async fetchFieldInfo(venueId: number): Promise<VenueFieldInfo | null> {
    const cached = this.cache.get(venueId);
    if (cached !== undefined) return cached;

    try {
      const url = `${MLB_VENUES_ENDPOINT}/${venueId}?hydrate=fieldInfo`;
      const response = await axios.get<VenueApiResponse>(url, {
        timeout: 8_000,
        headers: { 'User-Agent': 'mlb-gameday-ping/0.1' },
      });

      const venue = response.data.venues[0];
      const fi = venue?.fieldInfo;

      if (
        fi?.leftLine === undefined ||
        fi?.leftCenter === undefined ||
        fi?.center === undefined ||
        fi?.rightCenter === undefined ||
        fi?.rightLine === undefined
      ) {
        logger.warn('Venue fieldInfo incomplete or absent', { venueId });
        return null;
      }

      const result: VenueFieldInfo = {
        venueId,
        leftLine: fi.leftLine,
        leftCenter: fi.leftCenter,
        center: fi.center,
        rightCenter: fi.rightCenter,
        rightLine: fi.rightLine,
      };

      this.cache.set(venueId, result);
      logger.info('Venue fieldInfo fetched', {
        venueId,
        center: result.center,
        leftLine: result.leftLine,
        rightLine: result.rightLine,
      });
      return result;
    } catch (err) {
      logger.warn(
        'Venue fieldInfo fetch failed — SprayChart will use defaults',
        {
          venueId,
          message: err instanceof Error ? err.message : String(err),
        }
      );
      return null;
    }
  }
}
