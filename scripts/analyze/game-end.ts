/**
 * game-end.ts
 *
 * Analyzes the final ticks of a captured game session to diagnose why
 * game-end ('final' trackingMode) may not have been detected.
 *
 * Reports:
 * - Whether 'final' state was ever reached
 * - Last N ticks with full context (API data present, mode, score)
 * - What the API gameStatus string was at each of those ticks
 * - Whether game-summary was emitted
 *
 * Usage: npx tsx scripts/analyze/game-end.ts <ticks.ndjson>
 */
import type { CapturedTick } from '../../src/dev/capture-types.ts';
import {
  streamTicks,
  section,
  rule,
  fmtInning,
  fmtScore,
  fmtSeq,
  ok,
  warn,
  err,
  requireArg,
} from './lib.ts';

const TAIL_SIZE = 20;

async function main(): Promise<void> {
  const filePath = requireArg('scripts/analyze/game-end.ts');

  let totalTicks = 0;
  let finalSeq: number | null = null;
  let gameSummarySeq: number | null = null;
  const tail: CapturedTick[] = [];

  for await (const tick of streamTicks(filePath)) {
    totalTicks++;

    if (
      tick.emitted.gameUpdate?.trackingMode === 'final' &&
      finalSeq === null
    ) {
      finalSeq = tick.seq;
    }

    if (tick.emitted.gameSummary !== null && gameSummarySeq === null) {
      gameSummarySeq = tick.seq;
    }

    // Keep a rolling window of the last TAIL_SIZE ticks
    tail.push(tick);
    if (tail.length > TAIL_SIZE) tail.shift();
  }

  const lastTick = tail[tail.length - 1];

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  section('GAME-END DETECTION ANALYSIS');

  console.log(`\n  Total ticks captured: ${totalTicks}`);
  console.log(
    `  Final state reached:  ${finalSeq !== null ? `yes (tick ${finalSeq})` : 'NO ← BUG'}`
  );
  console.log(
    `  Game summary emitted: ${gameSummarySeq !== null ? `yes (tick ${gameSummarySeq})` : 'no'}`
  );

  if (lastTick?.emitted.gameUpdate) {
    const u = lastTick.emitted.gameUpdate;
    console.log(`\n  Last known state:`);
    console.log(`    mode:      ${u.trackingMode}`);
    console.log(`    inning:    ${fmtInning(u.inning)}`);
    console.log(`    score:     ${fmtScore(u.score)}`);
    console.log(`    gameStatus (API string): "${u.gameStatus}"`);
  }

  section(`LAST ${tail.length} TICKS`);

  console.log('');
  rule();
  console.log(
    `  ${'seq'.padEnd(6)} ${'wallTime (UTC)'.padEnd(25)} ${'mode'.padEnd(17)} ${'inning'.padEnd(14)} ${'score'.padEnd(8)} ${'gameStatus'.padEnd(20)} live  diff  summary`
  );
  rule();

  for (const tick of tail) {
    const u = tick.emitted.gameUpdate;
    const mode = u?.trackingMode ?? '—';
    const inning = u ? fmtInning(u.inning) : '—';
    const score = u ? fmtScore(u.score) : '—';
    const gameStatus = u?.gameStatus ?? '—';
    const hasLive = tick.api.gameFeedLive !== null ? 'yes' : 'no ';
    const hasDiff = tick.api.diffPatch !== null ? 'yes' : 'no ';
    const hasSummary = tick.emitted.gameSummary !== null ? 'YES' : 'no ';
    const marker = tick.seq === finalSeq ? '>>> ' : '    ';

    console.log(
      `  ${marker}${fmtSeq(tick.seq).padEnd(6)} ${tick.wallTime.padEnd(25)} ${mode.padEnd(17)} ${inning.padEnd(14)} ${score.padEnd(8)} ${gameStatus.padEnd(20)} ${hasLive}   ${hasDiff}   ${hasSummary}`
    );
  }

  section('DIAGNOSIS');
  console.log('');

  if (finalSeq !== null) {
    ok('Game correctly reached final state.');
    if (gameSummarySeq === null) {
      err(
        'Game summary was NOT emitted after final state. Check buildGameSummary and boxscore fetch paths in the scheduler.'
      );
    } else {
      ok('Game summary emitted.');
    }
  } else {
    // Diagnose why final was never reached
    const lastMode = lastTick?.emitted.gameUpdate?.trackingMode;
    const lastStatus = lastTick?.emitted.gameUpdate?.gameStatus;
    const lastScore = lastTick?.emitted.gameUpdate
      ? fmtScore(lastTick.emitted.gameUpdate.score)
      : '?';
    const lastInning = lastTick?.emitted.gameUpdate
      ? fmtInning(lastTick.emitted.gameUpdate.inning)
      : '?';

    err(`Game never reached final state.`);
    console.log('');
    console.log('  Likely causes:');

    if (lastMode === 'between-innings') {
      warn(
        `Last mode was 'between-innings' — game may have ended in the break.`
      );
      warn(
        `The away team may have been losing after their half — home team didn't bat.`
      );
      warn(
        `The MLB API returns 'Final' after the between-innings break resolves.`
      );
      warn(
        `If the capture was stopped during this window, final was never polled.`
      );
    }

    if (lastStatus && lastStatus !== 'Final') {
      warn(
        `Last gameStatus from API: "${lastStatus}" — parser condition may not match this string.`
      );
      warn(
        `Check parseGameUpdate(): look for the exact string used to detect 'final'.`
      );
    }

    console.log('');
    console.log(
      `  Last mode: ${lastMode ?? '?'}  |  inning: ${lastInning}  |  score: ${lastScore}  |  API status: "${lastStatus ?? '?'}"`
    );
  }

  console.log('');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
