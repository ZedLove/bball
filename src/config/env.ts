import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("*"),

  // MLB scheduler settings
  TEAM_ID: z.coerce.number().int().positive(),
  IDLE_POLL_INTERVAL: z.coerce.number().int().positive().default(60),
  ACTIVE_POLL_INTERVAL: z.coerce.number().int().positive().default(10),
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  RETRY_BACKOFF_MS: z.coerce.number().int().nonnegative().default(500),
});

const _env = EnvSchema.parse(process.env);

export const CONFIG = {
  PORT: _env.PORT,
  CORS_ORIGIN: _env.CORS_ORIGIN,

  /** MLB team ID – see https://statsapi.mlb.com/api/v1/teams */
  TEAM_ID: _env.TEAM_ID,
  /** Seconds between polls when no game is in progress */
  IDLE_POLL_INTERVAL: _env.IDLE_POLL_INTERVAL,
  /** Seconds between polls during an active game */
  ACTIVE_POLL_INTERVAL: _env.ACTIVE_POLL_INTERVAL,
  /** Max retry attempts per tick on network error */
  MAX_RETRIES: _env.MAX_RETRIES,
  /** Base back-off in ms (multiplied by 2^n on each retry) */
  RETRY_BACKOFF_MS: _env.RETRY_BACKOFF_MS,
} as const;