import * as fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import type { Interface as ReadlineInterface } from 'node:readline';
import type { Server as SocketIOServer } from 'socket.io';

import { TEAMS } from '../../config/teams.ts';
import { SOCKET_EVENTS } from '../../server/socket-events.ts';
import type {
  GameEventsPayload,
  GameSummary,
  PitchEvent,
} from '../../server/socket-events.ts';
import { parseGameUpdate } from '../../scheduler/parser.ts';
import type { GameUpdate } from '../../scheduler/parser.ts';
import { parseCurrentPlay } from '../../scheduler/current-play-parser.ts';
import { parseFeedEvents } from '../../scheduler/feed-parser.ts';
import { buildGameSummary } from '../../scheduler/summary-parser.ts';
import {
  mergePitcherStats,
  ZERO_PITCHER_STATS,
} from '../../scheduler/pitcher-stats.ts';
import type { PitcherGameStats } from '../../scheduler/pitcher-stats.ts';
import { mapPitchEvent } from '../../scheduler/pitch-mapper.ts';
import type { CapturedTick, CaptureSession } from '../capture-types.ts';

type ReplayMode = 'socket' | 'pipeline';

type PitcherStatsCacheEntry = {
  enrichmentStats: PitcherGameStats;
  enrichmentPitchHistory: PitchEvent[];
};

// ---------------------------------------------------------------------------
// Session + tick loading
// ---------------------------------------------------------------------------

function loadSession(dir: string): CaptureSession {
  const p = path.join(dir, 'session.json');
  if (!fs.existsSync(p)) throw new Error(`No session.json found in ${dir}`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as CaptureSession;
}

async function* streamTicks(
  dir: string
): AsyncGenerator<CapturedTick, void, void> {
  const p = path.join(dir, 'ticks.ndjson');
  if (!fs.existsSync(p)) throw new Error(`No ticks.ndjson found in ${dir}`);
  const rl = createInterface({
    input: fs.createReadStream(p),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      if (line.trim()) yield JSON.parse(line) as CapturedTick;
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Diff summary display
// ---------------------------------------------------------------------------

const BAR = '─'.repeat(58);

function buildTickSummary(
  tick: CapturedTick,
  previous: CapturedTick | null,
  mode: ReplayMode,
  total: number | '?'
): string {
  const update = tick.emitted.gameUpdate;
  const events = tick.emitted.gameEvents?.events ?? [];
  const lines: string[] = [];

  lines.push(`\n${BAR}`);
  lines.push(
    `  Tick ${tick.seq}/${total}  ·  ${mode} mode  ·  ${tick.wallTime}`
  );
  lines.push(BAR);

  if (update !== null) {
    lines.push(`  mode   : ${update.trackingMode}`);
    lines.push(`  inning : ${update.inning.half} ${update.inning.ordinal}`);
    lines.push(`  outs   : ${update.outs}`);
    lines.push(
      `  score  : ${update.teams.away.abbreviation} ${update.score.away} – ${update.score.home} ${update.teams.home.abbreviation}`
    );
    lines.push(`  atBat  : ${update.atBat !== null ? 'present' : 'absent'}`);
  } else {
    lines.push('  (no gameUpdate this tick)');
  }

  if (events.length > 0) {
    const cats = events.map((e) => e.category).join(', ');
    lines.push(`  events : ${events.length}  [${cats}]`);
  }

  if (tick.emitted.gameSummary !== null) {
    const { finalScore } = tick.emitted.gameSummary;
    lines.push(`  final  : ${finalScore.away} – ${finalScore.home}`);
  }

  // Delta vs. previous tick
  if (
    previous !== null &&
    update !== null &&
    previous.emitted.gameUpdate !== null
  ) {
    const prev = previous.emitted.gameUpdate;
    const delta: string[] = [];

    if (prev.trackingMode !== update.trackingMode)
      delta.push(`mode ${prev.trackingMode} → ${update.trackingMode}`);

    if (
      prev.inning.number !== update.inning.number ||
      prev.inning.half !== update.inning.half
    )
      delta.push(
        `inning ${prev.inning.half} ${prev.inning.ordinal} → ${update.inning.half} ${update.inning.ordinal}`
      );

    if (prev.outs !== update.outs)
      delta.push(`outs ${prev.outs} → ${update.outs}`);

    if (
      prev.score.away !== update.score.away ||
      prev.score.home !== update.score.home
    )
      delta.push(
        `score ${prev.score.away}–${prev.score.home} → ${update.score.away}–${update.score.home}`
      );

    if ((prev.atBat !== null) !== (update.atBat !== null))
      delta.push(`atBat ${prev.atBat !== null ? '↓ cleared' : '↑ started'}`);

    if (events.length > 0) delta.push(`+${events.length} event(s)`);

    if (delta.length > 0) lines.push(`  Δ      : ${delta.join('  |  ')}`);
  }

  lines.push(BAR);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Socket mode: emit saved payloads directly
// ---------------------------------------------------------------------------

function emitSocketTick(io: SocketIOServer, tick: CapturedTick): void {
  if (tick.emitted.gameUpdate !== null) {
    io.emit(SOCKET_EVENTS.GAME_UPDATE, tick.emitted.gameUpdate);
  }
  if (tick.emitted.gameEvents !== null) {
    io.emit(SOCKET_EVENTS.GAME_EVENTS, tick.emitted.gameEvents);
  }
  if (tick.emitted.gameSummary !== null) {
    io.emit(SOCKET_EVENTS.GAME_SUMMARY, tick.emitted.gameSummary);
  }
}

// ---------------------------------------------------------------------------
// Pipeline mode: re-run raw API data through the real parsers
// ---------------------------------------------------------------------------

function emitPipelineTick(
  io: SocketIOServer,
  tick: CapturedTick,
  gamePk: number,
  teamId: number,
  lastProcessedAtBatIndex: number,
  pitcherStatsCache: Map<number, PitcherStatsCacheEntry>
): number {
  const { schedule, gameFeedLive, diffPatch, boxscore } = tick.api;

  // Narrow the schedule to the captured gamePk so parseGameUpdate always
  // picks the correct game — handles doubleheaders and any other case where
  // the team appears more than once in dates[0].games.
  const filteredSchedule = {
    ...schedule,
    dates: schedule.dates.map((d) => ({
      ...d,
      games: d.games.filter((g) => g.gamePk === gamePk),
    })),
  };

  const gameUpdate: GameUpdate | null = parseGameUpdate(
    filteredSchedule,
    teamId
  );

  const linescore =
    schedule.dates[0]?.games.find((g) => g.gamePk === gamePk)?.linescore ??
    null;

  const atBat =
    gameFeedLive !== null && linescore !== null
      ? parseCurrentPlay(gameFeedLive, linescore)
      : null;

  // ── Pitcher enrichment (mirrors mlb-scheduler.ts) ──────────────────────────
  const pitcherId = gameUpdate?.currentPitcher?.id ?? null;

  // Clear cache on final, matching scheduler behavior.
  if (gameUpdate?.trackingMode === 'final') {
    pitcherStatsCache.clear();
  }

  if (pitcherId !== null) {
    if (!pitcherStatsCache.has(pitcherId)) {
      pitcherStatsCache.set(pitcherId, {
        enrichmentStats: ZERO_PITCHER_STATS,
        enrichmentPitchHistory: [],
      });
    }

    const allPlaysList = diffPatch?.liveData.plays.allPlays ?? null;
    if (allPlaysList !== null) {
      const cached = pitcherStatsCache.get(pitcherId)!;
      const deltaPitchHistory = allPlaysList
        .filter((play) => play.matchup.pitcher.id === pitcherId)
        .flatMap((play) =>
          play.playEvents.filter((ev) => ev.type === 'pitch').map(mapPitchEvent)
        );
      pitcherStatsCache.set(pitcherId, {
        enrichmentStats: mergePitcherStats(
          cached.enrichmentStats,
          deltaPitchHistory
        ),
        enrichmentPitchHistory: [
          ...cached.enrichmentPitchHistory,
          ...deltaPitchHistory,
        ],
      });
    }
  }

  // Only include pitches from an in-progress (isComplete === false) at-bat.
  // A completed currentPlay's pitches are already covered by the diffPatch
  // allPlays window — including them here would double-count them.
  const currentPlay = gameFeedLive?.liveData.plays.currentPlay ?? null;
  const currentAtBatPitches: PitchEvent[] =
    pitcherId !== null &&
    currentPlay !== null &&
    currentPlay.about.isComplete === false &&
    currentPlay.matchup.pitcher.id === pitcherId
      ? currentPlay.playEvents
          .filter((ev) => ev.type === 'pitch')
          .map(mapPitchEvent)
      : [];

  const pitcherEntry =
    pitcherId !== null ? (pitcherStatsCache.get(pitcherId) ?? null) : null;

  const mergedStats =
    pitcherEntry !== null
      ? mergePitcherStats(pitcherEntry.enrichmentStats, currentAtBatPitches)
      : null;

  const pitchHistory: PitchEvent[] =
    pitcherEntry !== null
      ? [...pitcherEntry.enrichmentPitchHistory, ...currentAtBatPitches]
      : [];

  if (gameUpdate !== null) {
    io.emit(SOCKET_EVENTS.GAME_UPDATE, {
      ...gameUpdate,
      atBat,
      pitchHistory,
      currentPitcher:
        gameUpdate.currentPitcher !== null && mergedStats !== null
          ? { ...gameUpdate.currentPitcher, ...mergedStats }
          : gameUpdate.currentPitcher,
    });
  }

  let nextAtBatIndex = lastProcessedAtBatIndex;

  if (diffPatch !== null) {
    const events = parseFeedEvents(diffPatch, gamePk, lastProcessedAtBatIndex);
    if (events.length > 0) {
      const payload: GameEventsPayload = { gamePk, events };
      io.emit(SOCKET_EVENTS.GAME_EVENTS, payload);
      nextAtBatIndex = Math.max(...events.map((e) => e.atBatIndex));
    }
  }

  if (gameUpdate?.trackingMode === 'final' && diffPatch !== null) {
    try {
      const gameSummary: GameSummary = buildGameSummary(
        gamePk,
        gameUpdate.score,
        gameUpdate.inning.number,
        gameUpdate.isExtraInnings,
        diffPatch,
        boxscore ?? { topPerformers: [] },
        null,
        teamId
      );
      io.emit(SOCKET_EVENTS.GAME_SUMMARY, gameSummary);
    } catch {
      // buildGameSummary throws when liveData.decisions is absent — non-fatal in replay
    }
  }

  return nextAtBatIndex;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function handleReplay(
  captureDir: string,
  rl: ReadlineInterface,
  io: SocketIOServer
): Promise<void> {
  const dir = path.isAbsolute(captureDir)
    ? captureDir
    : path.resolve(captureDir);

  let session: CaptureSession;
  try {
    session = loadSession(dir);
  } catch (err) {
    console.log(`\n⚠  ${String(err)}`);
    return;
  }

  const team = TEAMS[session.team];
  if (!team) {
    const validTeams = Object.keys(TEAMS).sort().join(', ');
    console.log(
      `\n⚠  Unknown team abbreviation "${session.team}" in capture session. Valid teams: ${validTeams}`
    );
    return;
  }

  const teamId = team.id;
  // tickCount > 0 only when the session closed cleanly; fall back to '?' when
  // the process was force-killed before the final writeSession() call.
  const total: number | '?' = session.tickCount > 0 ? session.tickCount : '?';
  let mode: ReplayMode = 'socket';
  let lastProcessedAtBatIndex = -1;
  const pitcherStatsCache = new Map<number, PitcherStatsCacheEntry>();
  let previous: CapturedTick | null = null;
  let ticksSeen = 0;

  console.log(`\n▶  Replay  ${session.team} · gamePk ${session.gamePk}`);
  console.log(
    `   ${
      total === '?' ? 'unknown tick count' : `${total} ticks`
    } · captured ${session.captureStart.slice(0, 10)}`
  );
  console.log(`   [Enter] advance  [m] toggle mode  [q] quit`);

  try {
    for await (const tick of streamTicks(dir)) {
      ticksSeen++;

      // Inner loop: re-display the same tick on mode-toggle, advance on Enter.
      let advanced = false;
      while (!advanced) {
        console.log(buildTickSummary(tick, previous, mode, total));

        const input = await new Promise<string>((resolve) => {
          rl.question(`(${tick.seq}/${total}) > `, resolve);
        });

        const cmd = input.trim().toLowerCase();

        if (cmd === 'q' || cmd === 'quit') {
          console.log('\n■  Replay ended.');
          return;
        }

        if (cmd === 'm') {
          mode = mode === 'socket' ? 'pipeline' : 'socket';
          // Reset pipeline cursor and stats cache when switching modes so
          // pipeline re-derives cleanly from the current tick forward.
          if (mode === 'pipeline') {
            lastProcessedAtBatIndex = -1;
            pitcherStatsCache.clear();
          }
          console.log(`\n   Switched to ${mode} mode`);
          continue; // re-display same tick with new mode label
        }

        // Empty input (Enter) — emit and advance
        if (mode === 'socket') {
          emitSocketTick(io, tick);
        } else {
          lastProcessedAtBatIndex = emitPipelineTick(
            io,
            tick,
            session.gamePk,
            teamId,
            lastProcessedAtBatIndex,
            pitcherStatsCache
          );
        }
        advanced = true;
      }

      previous = tick;
    }
  } catch (err) {
    console.log(`\n⚠  ${String(err)}`);
    return;
  }

  if (ticksSeen === 0) {
    console.log('\n⚠  No ticks found in this capture session.');
    return;
  }

  console.log('\n✓  Replay complete — all ticks consumed.');
}
