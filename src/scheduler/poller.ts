import axios from 'axios';
import { CONFIG } from '../config/env.ts';
import type { ScheduleResponse } from './types.ts';

export type { ScheduleResponse };

const MLB_SCHEDULE_ENDPOINT = 'https://statsapi.mlb.com/api/v1/schedule';

/**
 * Calls the MLB schedule endpoint for the configured team
 * with linescore and team hydrations for richer data.
 */
export async function fetchSchedule(): Promise<ScheduleResponse> {
  const url = `${MLB_SCHEDULE_ENDPOINT}?sportId=1&teamId=${CONFIG.TEAM_ID}&hydrate=linescore,team`;
  const response = await axios.get<ScheduleResponse>(url, {
    timeout: 8_000,
    headers: {
      'User-Agent': 'mlb-gameday-ping/0.1',
    },
  });
  return response.data;
}
