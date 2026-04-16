import axios from 'axios';
import type { NextGameScheduleResponse } from './game-feed-types.ts';

const MLB_SCHEDULE_ENDPOINT = 'https://statsapi.mlb.com/api/v1/schedule';
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Fetches upcoming scheduled games for the given team on or after `startDate`.
 *
 * The caller takes the first game from `dates[0].games[0]` — the closest
 * upcoming game. Hydrates `team` and `probablePitcher` fields.
 *
 * @param teamId    MLB team ID.
 * @param startDate Date string in "YYYY-MM-DD" format.
 */
export async function fetchNextGame(
  teamId: number,
  startDate: string,
): Promise<NextGameScheduleResponse> {
  const url = `${MLB_SCHEDULE_ENDPOINT}?sportId=1&teamId=${teamId}&startDate=${startDate}&hydrate=team,probablePitcher`;
  const response = await axios.get<NextGameScheduleResponse>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'User-Agent': 'mlb-gameday-ping/0.1' },
  });
  return response.data;
}
