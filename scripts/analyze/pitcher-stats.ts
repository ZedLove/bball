/**
 * pitcher-stats.ts
 *
 * Validates pitcher statistics consistency across a captured game session.
 *
 * Reports:
 * - Pitcher changes with entry stats
 * - Pitch count drift: ticks where strikes + balls ≠ pitchesThrown
 * - History drift: ticks where pitchHistory.length ≠ pitchesThrown
 * - Pitch count regressions: ticks where pitchesThrown decreases
 *
 * Usage: npx tsx scripts/analyze/pitcher-stats.ts <ticks.ndjson>
 */
import {
  streamTicks,
  section,
  rule,
  fmtInning,
  fmtSeq,
  ok,
  warn,
  err,
  requireArg,
} from './lib.ts';

interface PitcherEntry {
  seq: number;
  name: string;
  inning: string;
  pitchesThrown: number;
  strikes: number;
  balls: number;
  historyLen: number;
}

interface StatsMismatch {
  seq: number;
  name: string;
  pitchesThrown: number;
  strikes: number;
  balls: number;
  historyLen: number;
  type: 'COUNT_DRIFT' | 'HISTORY_DRIFT' | 'COUNT_REGRESSION';
  detail: string;
}

async function main(): Promise<void> {
  const filePath = requireArg('scripts/analyze/pitcher-stats.ts');

  let prevPitcherId: number | null = null;
  let prevPitchesThrown: number | null = null;

  const pitcherChanges: PitcherEntry[] = [];
  const mismatches: StatsMismatch[] = [];
  let totalTicksWithPitcher = 0;
  let ticksWithNonZeroStats = 0;

  for await (const tick of streamTicks(filePath)) {
    const update = tick.emitted.gameUpdate;
    if (!update?.currentPitcher) continue;

    const p = update.currentPitcher;
    const historyLen = update.pitchHistory.length;
    const inning = fmtInning(update.inning);
    totalTicksWithPitcher++;
    if (p.pitchesThrown > 0 || historyLen > 0) ticksWithNonZeroStats++;

    // Track pitcher changes
    if (p.id !== prevPitcherId) {
      pitcherChanges.push({
        seq: tick.seq,
        name: p.fullName,
        inning,
        pitchesThrown: p.pitchesThrown,
        strikes: p.strikes,
        balls: p.balls,
        historyLen,
      });
      prevPitcherId = p.id;
      prevPitchesThrown = p.pitchesThrown;
    }

    // Validate: strikes + balls === pitchesThrown
    if (p.strikes + p.balls !== p.pitchesThrown) {
      mismatches.push({
        seq: tick.seq,
        name: p.fullName,
        pitchesThrown: p.pitchesThrown,
        strikes: p.strikes,
        balls: p.balls,
        historyLen,
        type: 'COUNT_DRIFT',
        detail: `pitchesThrown(${p.pitchesThrown}) ≠ strikes(${p.strikes}) + balls(${p.balls}) = ${p.strikes + p.balls}`,
      });
    }

    // Validate: pitchHistory.length === pitchesThrown
    if (historyLen !== p.pitchesThrown) {
      mismatches.push({
        seq: tick.seq,
        name: p.fullName,
        pitchesThrown: p.pitchesThrown,
        strikes: p.strikes,
        balls: p.balls,
        historyLen,
        type: 'HISTORY_DRIFT',
        detail: `pitchHistory.length(${historyLen}) ≠ pitchesThrown(${p.pitchesThrown})`,
      });
    }

    // Validate: pitch count never decreases for the same pitcher
    if (
      prevPitcherId === p.id &&
      prevPitchesThrown !== null &&
      p.pitchesThrown < prevPitchesThrown
    ) {
      mismatches.push({
        seq: tick.seq,
        name: p.fullName,
        pitchesThrown: p.pitchesThrown,
        strikes: p.strikes,
        balls: p.balls,
        historyLen,
        type: 'COUNT_REGRESSION',
        detail: `pitchesThrown went ${prevPitchesThrown} → ${p.pitchesThrown} (decreased)`,
      });
    }

    prevPitchesThrown = p.id === prevPitcherId ? p.pitchesThrown : null;
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  section('PITCHER CHANGES');

  console.log(`\n  ${pitcherChanges.length} pitchers observed\n`);
  rule();
  console.log(
    `  ${'seq'.padEnd(6)} ${'name'.padEnd(22)} ${'inning'.padEnd(14)} ${'P'.padEnd(5)} ${'S'.padEnd(5)} ${'B'.padEnd(5)} ${'hist'.padEnd(5)} ok?`
  );
  rule();

  for (const pc of pitcherChanges) {
    const sumOk = pc.strikes + pc.balls === pc.pitchesThrown;
    const histOk = pc.historyLen === pc.pitchesThrown;
    const status = sumOk && histOk ? '✓' : '✗';
    console.log(
      `  ${fmtSeq(pc.seq).padEnd(6)} ${pc.name.padEnd(22)} ${pc.inning.padEnd(14)} ${pc.pitchesThrown.toString().padEnd(5)} ${pc.strikes.toString().padEnd(5)} ${pc.balls.toString().padEnd(5)} ${pc.historyLen.toString().padEnd(5)} ${status}`
    );
  }

  section('STATISTICS MISMATCHES');

  if (mismatches.length === 0) {
    console.log('');
    ok('All pitcher statistics are consistent across all ticks.');
  } else {
    const byType = new Map<string, StatsMismatch[]>();
    for (const m of mismatches) {
      const existing = byType.get(m.type) ?? [];
      existing.push(m);
      byType.set(m.type, existing);
    }

    for (const [type, items] of byType) {
      console.log(`\n  ${type}  (${items.length} occurrences)\n`);
      rule();
      for (const m of items.slice(0, 10)) {
        err(`  [${fmtSeq(m.seq)}] ${m.name.padEnd(22)} ${m.detail}`);
      }
      if (items.length > 10) {
        warn(`  ... and ${items.length - 10} more`);
      }
    }
  }

  section('SUMMARY');
  const countDrifts = mismatches.filter((m) => m.type === 'COUNT_DRIFT').length;
  const histDrifts = mismatches.filter(
    (m) => m.type === 'HISTORY_DRIFT'
  ).length;
  const regressions = mismatches.filter(
    (m) => m.type === 'COUNT_REGRESSION'
  ).length;

  console.log(`\n  Pitchers observed:    ${pitcherChanges.length}`);
  console.log(
    `  COUNT_DRIFT:          ${countDrifts}  ${countDrifts > 0 ? '← B+S ≠ total' : '(none)'}`
  );
  console.log(
    `  HISTORY_DRIFT:        ${histDrifts}  ${histDrifts > 0 ? '← pitchHistory mismatch' : '(none)'}`
  );
  console.log(
    `  COUNT_REGRESSION:     ${regressions}  ${regressions > 0 ? '← pitch count went backwards' : '(none)'}`
  );
  if (totalTicksWithPitcher > 0 && ticksWithNonZeroStats === 0) {
    console.log('');
    err(
      `Stats were ALWAYS ZERO across all ${totalTicksWithPitcher} ticks with a pitcher present.`
    );
    err(
      `This means pitcher stats enrichment never ran. The capture script may be missing`
    );
    err(
      `the cachedPitcherStats / mergePitcherStats logic from the real scheduler.`
    );
  }
  console.log('');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
