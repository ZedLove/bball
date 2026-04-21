import type { GameUpdate } from '../../scheduler/parser.ts';

export function formatScore(update: GameUpdate): string {
  const { away, home } = update.teams;
  const { score } = update;
  return `${away.abbreviation} ${score.away} – ${home.abbreviation} ${score.home}`;
}

export function formatInning(update: GameUpdate): string {
  const arrow = update.inning.half === 'Bottom' ? '⬇' : '⬆';
  return `${arrow} ${update.inning.ordinal}`;
}

export function formatOuts(outs: number): string {
  return `${outs} out`;
}

export function formatCount(count: { balls: number; strikes: number }): string {
  return `${count.balls}-${count.strikes}`;
}
