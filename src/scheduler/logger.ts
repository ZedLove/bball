import { logger } from '../config/logger.ts';
import type { GameUpdate } from './parser.ts';

/**
 * Debug-only log of game updates. Socket.IO emission is the primary delivery
 * mechanism; this provides observability in server logs.
 */
export function logUpdate(update: GameUpdate): void {
  const scoreLine = `${update.teams.away.abbreviation} ${update.score.away} - ${update.teams.home.abbreviation} ${update.score.home}`;
  const inningLine = `${update.inning.half} ${update.inning.ordinal}`;

  if (update.trackingMode === 'outs') {
    const totalStr = update.totalOutsRemaining !== null
      ? ` / ${update.totalOutsRemaining} total`
      : '';
    logger.info(
      '%s defending | %s | Outs: %d (remaining: %d%s) | %s%s',
      update.defendingTeam,
      inningLine,
      update.outs,
      update.outsRemaining,
      totalStr,
      scoreLine,
      update.isExtraInnings ? ' [EXTRAS]' : '',
    );
  } else {
    logger.info(
      'Batting (extras) | %s | Runs needed: %d | %s [EXTRAS]',
      inningLine,
      update.runsNeeded,
      scoreLine,
    );
  }
}
