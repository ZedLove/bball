import { logger } from '../config/logger.ts';
import type { GameUpdate } from './parser.ts';

/**
 * Debug-only log of game updates. Socket.IO emission is the primary delivery
 * mechanism; this provides observability in server logs.
 */
export function logUpdate(update: GameUpdate): void {
  const scoreLine = `${update.teams.away.abbreviation} ${update.score.away} - ${update.teams.home.abbreviation} ${update.score.home}`;
  const inningLine = `${update.inning.half} ${update.inning.ordinal}`;
  const delayPrefix = update.isDelayed ? ' [DELAYED]' : '';

  if (update.trackingMode === 'live') {
    const outsStr =
      update.outsRemaining !== null
        ? ` | Outs: ${update.outs} (rem: ${update.outsRemaining}${update.totalOutsRemaining !== null ? `/${update.totalOutsRemaining}` : ''})`
        : '';
    const pitcherStr = update.currentPitcher
      ? ` | P: ${update.currentPitcher.fullName}`
      : '';
    const extrasStr =
      update.runsNeeded !== null
        ? ` | Runs needed: ${update.runsNeeded} [EXTRAS]`
        : update.isExtraInnings
          ? ' [EXTRAS]'
          : '';
    logger.info(
      'LIVE | %s | %s%s%s%s%s',
      inningLine,
      scoreLine,
      outsStr,
      pitcherStr,
      extrasStr,
      delayPrefix
    );
  } else if (update.trackingMode === 'between-innings') {
    const pitcherStr = update.upcomingPitcher
      ? ` | Next P: ${update.upcomingPitcher.fullName}`
      : '';
    logger.info(
      'Between innings | %s | %s%s%s',
      inningLine,
      scoreLine,
      pitcherStr,
      delayPrefix
    );
  } else if (update.trackingMode === 'final') {
    logger.info('Game Final | %s | %s [FINAL]', inningLine, scoreLine);
  }
}
