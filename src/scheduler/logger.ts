import { logger } from '../config/logger.ts';
import type { GameUpdate } from './types.ts';

export type { GameUpdate };

/**
 * Debug-only log of game updates. Socket.IO emission is the primary delivery
 * mechanism; this provides observability in server logs.
 */
export function logUpdate(update: GameUpdate): void {
  logger.info(
    '%s defending | %s %s | Outs: %d | %s %d - %s %d',
    update.defendingTeam,
    update.inning.half,
    update.inning.ordinal,
    update.outs,
    update.teams.away.abbreviation,
    update.score.away,
    update.teams.home.abbreviation,
    update.score.home,
  );
}
