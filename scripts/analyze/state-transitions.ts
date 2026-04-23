/**
 * state-transitions.ts
 *
 * Analyzes trackingMode and inning transitions across a captured game session.
 *
 * Reports:
 * - Every mode/inning change in sequence
 * - Missing game-end (trackingMode never reached 'final')
 * - Suspicious transitions that skip expected intermediate states
 *
 * Usage: npx tsx scripts/analyze/state-transitions.ts <ticks.ndjson>
 */
import type { GameUpdate } from '../../src/scheduler/parser.ts';
import {
  streamTicks,
  section,
  rule,
  fmtInning,
  fmtScore,
  fmtSeq,
  ok,
  err,
  requireArg,
} from './lib.ts';

interface Transition {
  seq: number;
  wallTime: string;
  fromMode: string;
  fromInning: string;
  toMode: string;
  toInning: string;
  score: string;
  outs: number;
}

interface Issue {
  seq: number;
  type: string;
  message: string;
}

async function main(): Promise<void> {
  const filePath = requireArg('scripts/analyze/state-transitions.ts');

  let prev: GameUpdate | null = null;
  const transitions: Transition[] = [];
  const issues: Issue[] = [];
  let ticksWithGameUpdate = 0;

  for await (const tick of streamTicks(filePath)) {
    const update = tick.emitted.gameUpdate;
    if (!update) continue;

    ticksWithGameUpdate++;

    const modeChanged =
      prev === null || update.trackingMode !== prev.trackingMode;
    const inningChanged =
      prev === null ||
      update.inning.number !== prev.inning.number ||
      update.inning.half !== prev.inning.half;

    if (modeChanged || inningChanged) {
      transitions.push({
        seq: tick.seq,
        wallTime: tick.wallTime,
        fromMode: prev?.trackingMode ?? 'START',
        fromInning: prev ? fmtInning(prev.inning) : 'START',
        toMode: update.trackingMode,
        toInning: fmtInning(update.inning),
        score: fmtScore(update.score),
        outs: update.outs,
      });
    }

    if (prev !== null && modeChanged) {
      const from = prev.trackingMode;
      const to = update.trackingMode;

      // A transition directly into final from any mode is the expected game-end path.
      // Flag only transitions that look structurally wrong.

      // batting/outs should not jump from final (can't restart)
      if (from === 'final' && to !== 'final') {
        issues.push({
          seq: tick.seq,
          type: 'RESUMED_AFTER_FINAL',
          message: `Mode resumed as '${to}' after reaching 'final'`,
        });
      }

      // between-innings should never jump directly to final without at least
      // one active inning (only a concern if no active play happened before)
      if (
        from === 'between-innings' &&
        to === 'final' &&
        transitions.length < 3
      ) {
        issues.push({
          seq: tick.seq,
          type: 'PREMATURE_FINAL',
          message: `Reached 'final' directly from 'between-innings' after very few ticks`,
        });
      }
    }

    prev = update;
  }

  // Check if game ever ended
  const reachedFinal = transitions.some((t) => t.toMode === 'final');
  const lastTransition = transitions[transitions.length - 1];

  if (!reachedFinal) {
    issues.push({
      seq: lastTransition?.seq ?? -1,
      type: 'GAME_END_NOT_DETECTED',
      message: `Game never reached 'final' state. Last mode: '${lastTransition?.toMode}' (${lastTransition?.toInning}). Score: ${lastTransition?.score}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  section('STATE TRANSITIONS');

  console.log(`\n  Total transitions: ${transitions.length}\n`);
  rule();

  const COL = { seq: 6, mode: 18, inning: 18, score: 8, outs: 6 };
  console.log(
    `  ${'seq'.padEnd(COL.seq)} ${'from'.padEnd(COL.mode + COL.inning + 1)} ${'to'.padEnd(COL.mode + COL.inning + 1)} ${'score'.padEnd(COL.score)} outs`
  );
  rule();

  for (const t of transitions) {
    const from = `${t.fromMode}/${t.fromInning}`.padEnd(COL.mode + COL.inning);
    const to = `${t.toMode}/${t.toInning}`.padEnd(COL.mode + COL.inning);
    console.log(
      `  ${fmtSeq(t.seq).padEnd(COL.seq)} ${from} ${to} ${t.score.padEnd(COL.score)} ${t.outs}`
    );
  }

  if (issues.length === 0) {
    console.log('');
    ok('No state machine issues detected.');
  } else {
    console.log(`\n`);
    for (const issue of issues) {
      err(`[tick ${fmtSeq(issue.seq)}] ${issue.type}: ${issue.message}`);
    }
  }

  section('SUMMARY');
  console.log(`\n  Total ticks with gameUpdate: ${ticksWithGameUpdate}`);
  console.log(
    `  Final state reached:         ${reachedFinal ? 'yes' : 'NO ← BUG'}`
  );
  console.log(
    `  Last known mode:             ${lastTransition?.toMode ?? 'none'}`
  );
  console.log(
    `  Last known inning:           ${lastTransition?.toInning ?? 'none'}`
  );
  console.log(
    `  Last known score:            ${lastTransition?.score ?? 'none'}`
  );
  console.log('');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
