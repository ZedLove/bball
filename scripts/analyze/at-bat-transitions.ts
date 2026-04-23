/**
 * at-bat-transitions.ts
 *
 * Tracks atBat state changes across a captured game session.
 *
 * Reports:
 * - Every batter change (new at-bat started, pitcher changed mid-at-bat)
 * - Null atBat drops while in an active mode ('batting' or 'outs')
 * - Classifies drops as:
 *   - INTERSTITIAL: 1-tick null between consecutive at-bats (known: completed play,
 *     next play not yet started — root cause: parseCurrentPlay returns null when
 *     currentPlay.about.isComplete === true)
 *   - SUSTAINED: >1 consecutive null ticks in active mode (indicates a deeper issue)
 *
 * Usage: npx tsx scripts/analyze/at-bat-transitions.ts <ticks.ndjson>
 */
import type { CapturedTick } from '../../src/dev/capture-types.ts';
import type { AtBatState } from '../../src/server/socket-events.ts';
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

interface Drop {
  startSeq: number;
  endSeq: number;
  mode: string;
  inning: string;
  score: string;
  /** The batter who was active before the drop. */
  prevBatter: string;
  /** The batter who appeared after the drop (may be same or different). */
  nextBatter: string | null;
  /** true when hasLive=true but atBat was still null — live feed present but parser returned null */
  liveFeedPresent: boolean;
}

interface BatterChange {
  seq: number;
  wallTime: string;
  from: string;
  to: string;
  mode: string;
  inning: string;
  events: number;
}

const ACTIVE_MODES = new Set(['batting', 'outs', 'runs']);

async function main(): Promise<void> {
  const filePath = requireArg('scripts/analyze/at-bat-transitions.ts');

  let prevAtBat: AtBatState | null = null;
  let prevTick: CapturedTick | null = null;

  // Accumulate an in-progress drop span
  let dropStart: {
    seq: number;
    mode: string;
    inning: string;
    score: string;
    prevBatter: string;
    liveFeedPresent: boolean;
  } | null = null;

  const drops: Drop[] = [];
  const batterChanges: BatterChange[] = [];

  for await (const tick of streamTicks(filePath)) {
    const update = tick.emitted.gameUpdate;
    if (!update) {
      prevTick = tick;
      continue;
    }

    const atBat = update.atBat;
    const mode = update.trackingMode;
    const hasAtBat = atBat !== null;
    const hadAtBat = prevAtBat !== null;
    const inActiveMode = ACTIVE_MODES.has(mode);

    // ── Batter/pitcher change detection ──────────────────────────────────────
    if (hasAtBat && hadAtBat) {
      const batterChanged = atBat.batter.id !== prevAtBat!.batter.id;
      const pitcherChanged = atBat.pitcher.id !== prevAtBat!.pitcher.id;
      if (batterChanged || pitcherChanged) {
        batterChanges.push({
          seq: tick.seq,
          wallTime: tick.wallTime,
          from: `${prevAtBat!.batter.fullName} vs ${prevAtBat!.pitcher.fullName}`,
          to: `${atBat.batter.fullName} vs ${atBat.pitcher.fullName}`,
          mode,
          inning: fmtInning(update.inning),
          events: tick.emitted.gameEvents?.events.length ?? 0,
        });
      }
    }

    // ── Drop span tracking ────────────────────────────────────────────────────
    if (!hasAtBat && hadAtBat && inActiveMode) {
      // Start of a drop
      dropStart = {
        seq: tick.seq,
        mode,
        inning: fmtInning(update.inning),
        score: fmtScore(update.score),
        prevBatter: prevAtBat!.batter.fullName,
        liveFeedPresent: tick.api.gameFeedLive !== null,
      };
    } else if (hasAtBat && dropStart !== null) {
      // Drop resolved — record it
      drops.push({
        startSeq: dropStart.seq,
        endSeq: tick.seq,
        mode: dropStart.mode,
        inning: dropStart.inning,
        score: dropStart.score,
        prevBatter: dropStart.prevBatter,
        nextBatter: atBat.batter.fullName,
        liveFeedPresent: dropStart.liveFeedPresent,
      });
      dropStart = null;
    } else if (!hasAtBat && dropStart === null && !inActiveMode) {
      // Legitimate null (between-innings, final) — not a drop
    } else if (!hasAtBat && dropStart !== null && !inActiveMode) {
      // Mode transitioned to non-active while in a drop — close it
      drops.push({
        startSeq: dropStart.seq,
        endSeq: tick.seq,
        mode: dropStart.mode,
        inning: dropStart.inning,
        score: dropStart.score,
        prevBatter: dropStart.prevBatter,
        nextBatter: null,
        liveFeedPresent: dropStart.liveFeedPresent,
      });
      dropStart = null;
    }

    prevAtBat = atBat;
    prevTick = tick;
  }

  // Close any drop still open at end of capture
  if (dropStart !== null) {
    drops.push({
      startSeq: dropStart.seq,
      endSeq: prevTick?.seq ?? dropStart.seq,
      mode: dropStart.mode,
      inning: dropStart.inning,
      score: dropStart.score,
      prevBatter: dropStart.prevBatter,
      nextBatter: null,
      liveFeedPresent: dropStart.liveFeedPresent,
    });
  }

  // Classify drops
  const interstitial = drops.filter((d) => d.endSeq - d.startSeq === 1);
  const sustained = drops.filter((d) => d.endSeq - d.startSeq > 1);

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  section('AT-BAT TRANSITIONS');

  console.log(`\n  Batter/pitcher changes: ${batterChanges.length}\n`);
  rule();
  for (const bc of batterChanges) {
    console.log(
      `  [${fmtSeq(bc.seq)}] ${bc.from.padEnd(45)} → ${bc.to} (${bc.mode} | ${bc.inning} | +${bc.events} events)`
    );
  }

  section('AT-BAT NULL DROPS');

  console.log(
    `\n  Total drops: ${drops.length}  (interstitial: ${interstitial.length}, sustained: ${sustained.length})\n`
  );

  if (interstitial.length > 0) {
    rule();
    console.log(
      '  INTERSTITIAL (1-tick, expected — completed play before next batter loads):\n'
    );
    for (const d of interstitial) {
      console.log(
        `  [${fmtSeq(d.startSeq)}→${fmtSeq(d.endSeq)}] ${d.mode.padEnd(15)} | ${d.inning.padEnd(12)} | prev: ${d.prevBatter.padEnd(22)} → next: ${d.nextBatter ?? '?'} | live: ${d.liveFeedPresent}`
      );
    }
    console.log('');
    warn(
      `Root cause: parseCurrentPlay returns null when currentPlay.about.isComplete === true.`
    );
    warn(
      `Fix: hold previous atBat in scheduler until a new non-null atBat arrives.`
    );
  }

  if (sustained.length > 0) {
    console.log('');
    rule();
    console.log('  SUSTAINED (>1 tick, unexpected — likely a bug):\n');
    for (const d of sustained) {
      err(
        `  [${fmtSeq(d.startSeq)}→${fmtSeq(d.endSeq)}] ${d.mode.padEnd(15)} | ${d.inning.padEnd(12)} | prev: ${d.prevBatter} | ticks: ${d.endSeq - d.startSeq}`
      );
    }
  } else {
    console.log('');
    ok('No sustained drops detected.');
  }

  section('SUMMARY');
  console.log(`\n  Batter changes:      ${batterChanges.length}`);
  console.log(
    `  Interstitial drops:  ${interstitial.length}  (1-tick between-at-bat null — known cause)`
  );
  console.log(
    `  Sustained drops:     ${sustained.length}  ${sustained.length > 0 ? '← BUG' : '(none)'}`
  );
  console.log('');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
