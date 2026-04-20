import axios from 'axios';
import type { GameFeedLiveResponse } from './game-feed-types.ts';

const MLB_GAME_FEED_BASE = 'https://statsapi.mlb.com/api/v1.1/game';
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Fetches the full current live-feed for the given game.
 *
 * Unlike the diffPatch variant, this always returns the complete current state
 * of the game — no timecode cursor is required or accepted.
 *
 * Does not catch errors; callers are responsible for handling failures.
 *
 * @param gamePk  MLB game identifier.
 */
export async function fetchGameFeedLive(
  gamePk: number
): Promise<GameFeedLiveResponse> {
  const url = `${MLB_GAME_FEED_BASE}/${gamePk}/feed/live`;
  const response = await axios.get<GameFeedLiveResponse>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'User-Agent': 'mlb-gameday-ping/0.1' },
  });
  return response.data;
}
