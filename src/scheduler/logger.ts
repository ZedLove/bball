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

  if (update.trackingMode === 'outs') {
    const totalStr =
      update.totalOutsRemaining !== null
        ? ` / ${update.totalOutsRemaining} total`
        : '';
    const pitcherStr = update.currentPitcher
      ? ` | P: ${update.currentPitcher.fullName}`
      : '';
    const pitchingChangeStr = update.pitchingChange ? ' [PITCHING CHANGE]' : '';
    logger.info(
      '%s defending | %s | Outs: %d (remaining: %d%s)%s | %s%s%s%s',
      update.defendingTeam,
      inningLine,
      update.outs,
      update.outsRemaining,
      totalStr,
      pitcherStr,
      scoreLine,
      update.isExtraInnings ? ' [EXTRAS]' : '',
      pitchingChangeStr,
      delayPrefix
    );
  } else if (update.trackingMode === 'runs') {
    logger.info(
      'Batting (extras) | %s | Runs needed: %d | %s [EXTRAS]%s',
      inningLine,
      update.runsNeeded,
      scoreLine,
      delayPrefix
    );
  } else if (update.trackingMode === 'between-innings') {
    const breakStr =
      update.inningBreakLength !== null
        ? ` (${update.inningBreakLength}s break)`
        : '';
    const pitcherStr = update.currentPitcher
      ? ` | Last P: ${update.currentPitcher.fullName}`
      : '';
    logger.info(
      'Between innings | %s%s | %s%s%s',
      inningLine,
      breakStr,
      scoreLine,
      pitcherStr,
      delayPrefix
    );
  } else if (update.trackingMode === 'final') {
    logger.info('Game Final | %s | %s [FINAL]', inningLine, scoreLine);
  } else {
    logger.info(
      '%s batting | %s | %s%s',
      update.battingTeam,
      inningLine,
      scoreLine,
      delayPrefix
    );
  }
}
