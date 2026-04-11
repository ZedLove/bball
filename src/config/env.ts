import * as dotenv from "dotenv";
import { z } from "zod";
import { TEAMS } from "./teams.ts";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("*"),

  // MLB scheduler settings
  // TEAM_ID can be set directly, or resolved via the TEAM abbreviation (e.g. TEAM=NYM).
  // TEAM takes precedence if both are set.
  TEAM_ID: z.coerce.number().int().positive().optional(),
  IDLE_POLL_INTERVAL: z.coerce.number().int().positive().default(60),
  ACTIVE_POLL_INTERVAL: z.coerce.number().int().positive().default(10),
  BATTING_POLL_INTERVAL: z.coerce.number().int().positive().default(30),
  /** Extra seconds added to inningBreakLength before resuming active polling after a half-inning ends. */
  BETWEEN_INNINGS_BUFFER_S: z.coerce.number().int().nonnegative().default(15),
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(500),
});

const _env = EnvSchema.parse(process.env);

function resolveTeamId(): number {
  const abbrev = process.env.TEAM?.toUpperCase();
  if (abbrev) {
    const team = TEAMS[abbrev];
    if (!team) {
      const valid = Object.keys(TEAMS).sort().join(', ');
      throw new Error(`Unknown team abbreviation "${abbrev}". Valid options: ${valid}`);
    }
    return team.id;
  }
  if (_env.TEAM_ID !== undefined) {
    return _env.TEAM_ID;
  }
  throw new Error(
    'No team configured. Set TEAM_ID in .env or pass TEAM=<abbreviation> (e.g. TEAM=TOR npm run dev)',
  );
}

export const CONFIG = {
  PORT: _env.PORT,
  CORS_ORIGIN: _env.CORS_ORIGIN,

  /** MLB team ID – resolved from TEAM abbreviation or TEAM_ID env var */
  TEAM_ID: resolveTeamId(),
  /** Seconds between polls when no game is in progress */
  IDLE_POLL_INTERVAL: _env.IDLE_POLL_INTERVAL,
  /** Seconds between polls during an active game */
  ACTIVE_POLL_INTERVAL: _env.ACTIVE_POLL_INTERVAL,
  /** Seconds between polls while target team is batting in regulation */
  BATTING_POLL_INTERVAL: _env.BATTING_POLL_INTERVAL,
  /** Extra seconds buffered after the API's inningBreakLength before resuming active polling */
  BETWEEN_INNINGS_BUFFER_S: _env.BETWEEN_INNINGS_BUFFER_S,
  /** Max retry attempts per tick on network error */
  MAX_RETRIES: _env.MAX_RETRIES,
  /** Base back-off in ms (multiplied by 2^n on each retry) */
  RETRY_BACKOFF_MS: _env.RETRY_BACKOFF_MS,
} as const;