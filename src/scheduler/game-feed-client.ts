import axios from 'axios';
import type { GameFeedResponse } from './game-feed-types.ts';

const MLB_GAME_FEED_BASE = 'https://statsapi.mlb.com/api/v1.1/game';
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Fetches a delta live-feed response for the given game starting from
 * `startTimecode` (format: "YYYYMMDD_HHmmss" UTC).
 *
 * The `diffPatch` endpoint returns all completed plays since that timecode.
 * Persist `response.metaData.timeStamp` as the cursor for the next call.
 *
 * Returns `null` when the API indicates there are no new events since the
 * given timecode (the endpoint returns an empty array `[]` in that case).
 * This is a normal condition: the linescore endpoint and the diffPatch
 * endpoint have different update latencies, so enrichment may be triggered
 * before the diffPatch has indexed the latest events.
 *
 * @param gamePk        MLB game identifier.
 * @param startTimecode Cursor from the previous fetch, or the game's start
 *                      time on first bootstrap.
 */
export async function fetchGameFeed(
  gamePk: number,
  startTimecode: string
): Promise<GameFeedResponse | null> {
  const url = `${MLB_GAME_FEED_BASE}/${gamePk}/feed/live/diffPatch?startTimecode=${encodeURIComponent(startTimecode)}`;
  const response = await axios.get<GameFeedResponse | []>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'User-Agent': 'mlb-gameday-ping/0.1' },
  });
  if (Array.isArray(response.data)) {
    return null;
  }
  return response.data;
}
