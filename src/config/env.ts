import * as dotenv from 'dotenv';
import { z } from 'zod';
import { TEAMS } from './teams.ts';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('*'),

  // MLB scheduler settings
  // TEAM_ID can be set directly, or resolved via the TEAM abbreviation (e.g. TEAM=NYM).
  // TEAM takes precedence if both are set.
  TEAM_ID: z.coerce.number().int().positive().optional(),
  IDLE_POLL_INTERVAL: z.coerce.number().int().positive().default(60),
  ACTIVE_POLL_INTERVAL: z.coerce.number().int().positive().default(10),
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(500),
});

const _env = EnvSchema.parse(process.env);

/** True when DEV_MODE=true is set – disables real polling, activates the dev simulator. */
const DEV_MODE = process.env.DEV_MODE === 'true';

/** True when ENABLE_ADMIN_UI=true is set – mounts the @socket.io/admin-ui panel. Requires explicit opt-in. */
const ENABLE_ADMIN_UI = process.env.ENABLE_ADMIN_UI === 'true';

function resolveTeamId(): number {
  const abbrev = process.env.TEAM?.toUpperCase();
  if (abbrev) {
    const team = TEAMS[abbrev];
    if (!team) {
      const valid = Object.keys(TEAMS).sort().join(', ');
      throw new Error(
        `Unknown team abbreviation "${abbrev}". Valid options: ${valid}`
      );
    }
    return team.id;
  }
  if (_env.TEAM_ID !== undefined) {
    return _env.TEAM_ID;
  }
  throw new Error(
    'No team configured. Set TEAM_ID in .env or pass TEAM=<abbreviation> (e.g. TEAM=TOR npm run dev)'
  );
}

export const CONFIG = {
  PORT: _env.PORT,
  CORS_ORIGIN: _env.CORS_ORIGIN,

  /** When true, real MLB polling is disabled and the dev event simulator runs instead. */
  DEV_MODE,

  /** When true, mounts the @socket.io/admin-ui panel. Set ENABLE_ADMIN_UI=true to opt in (dev tool only). */
  ENABLE_ADMIN_UI,

  /** MLB team ID – resolved from TEAM abbreviation or TEAM_ID env var */
  TEAM_ID: DEV_MODE ? 0 : resolveTeamId(),
  /** Seconds between polls when no game is in progress */
  IDLE_POLL_INTERVAL: _env.IDLE_POLL_INTERVAL,
  /** Seconds between polls during an active game */
  ACTIVE_POLL_INTERVAL: _env.ACTIVE_POLL_INTERVAL,
  /** Max retry attempts per tick on network error */
  MAX_RETRIES: _env.MAX_RETRIES,
  /** Base back-off in ms (multiplied by 2^n on each retry) */
  RETRY_BACKOFF_MS: _env.RETRY_BACKOFF_MS,
} as const;
