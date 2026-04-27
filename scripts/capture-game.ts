#!/usr/bin/env tsx
/**
 * Game capture script — dev use only, not included in server builds.
 *
 * Polls the MLB API for a live game, recording all raw API responses and
 * computed Socket.IO payloads to disk for offline replay and state-transition
 * debugging.
 *
 * Usage:
 *   TEAM=NYM npx tsx scripts/capture-game.ts
 *   TEAM_ID=121 npx tsx scripts/capture-game.ts
 *
 * Output: captures/<YYYY-MM-DD>-<gamePk>/
 *   session.json   — session metadata (gamePk, team, tick count)
 *   ticks.ndjson   — one JSON line per poll tick (raw API + emitted payloads)
 *   capture.log    — timestamped log of capture activity
 *
 * Stop with Ctrl-C; session.json is written on exit.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CONFIG } from '../src/config/env.ts';
import { TEAMS } from '../src/config/teams.ts';
import { fetchSchedule } from '../src/scheduler/schedule-client.ts';
import type {
  ScheduleResponse,
  Linescore,
} from '../src/scheduler/schedule-client.ts';
import { fetchGameFeedLive } from '../src/scheduler/game-feed-live-client.ts';
import { fetchGameFeed } from '../src/scheduler/game-feed-client.ts';
import { fetchBoxscore } from '../src/scheduler/boxscore-client.ts';
import { parseGameUpdate } from '../src/scheduler/parser.ts';
import type { GameUpdate } from '../src/server/socket-events.ts';
import { parseCurrentPlay } from '../src/scheduler/current-play-parser.ts';
import { parseFeedEvents } from '../src/scheduler/feed-parser.ts';
import { buildGameSummary } from '../src/scheduler/summary-parser.ts';
import { createEnrichmentState } from '../src/scheduler/enrichment-state.ts';
import type { EnrichmentState } from '../src/scheduler/enrichment-state.ts';
import { hasLinescoreDelta } from '../src/scheduler/change-detector.ts';
import { toTimecode } from '../src/scheduler/mlb-scheduler.ts';
import type {
  AtBatState,
  GameEventsPayload,
  GameSummary,
  PitchEvent,
} from '../src/server/socket-events.ts';
import {
  mergePitcherStats,
  ZERO_PITCHER_STATS,
} from '../src/scheduler/pitcher-stats.ts';
import type { PitcherGameStats } from '../src/scheduler/pitcher-stats.ts';
import { mapPitchEvent } from '../src/scheduler/pitch-mapper.ts';
import type { CapturedTick, CaptureSession } from '../src/dev/capture-types.ts';
import type {
  GameFeedLiveResponse,
  GameFeedResponse,
  BoxscoreResponse,
} from '../src/scheduler/game-feed-types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveTeamAbbreviation(teamId: number): string {
  const entry = Object.entries(TEAMS).find(([, t]) => t.id === teamId);
  return entry?.[0] ?? String(teamId);
}

/**
 * Returns captures/<date>-<gamePk>, incrementing a numeric suffix if that
 * directory already exists (e.g. captures/2026-04-22-716463-2).
 */
function resolveSessionDir(date: string, gamePk: number): string {
  const base = path.join('captures', `${date}-${gamePk}`);
  if (!fs.existsSync(base)) return base;
  let n = 2;
  while (fs.existsSync(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function getNextIntervalMs(trackingMode: GameUpdate['trackingMode']): number {
  if (trackingMode === 'live') {
    return CONFIG.ACTIVE_POLL_INTERVAL * 1000;
  }
  return CONFIG.IDLE_POLL_INTERVAL * 1000;
}

// ---------------------------------------------------------------------------
// Session-scoped logger (console + optional file)
// ---------------------------------------------------------------------------

let logFilePath: string | null = null;

function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const line =
    data !== undefined
      ? `[${ts}] ${msg} ${JSON.stringify(data)}`
      : `[${ts}] ${msg}`;
  console.log(line);
  if (logFilePath !== null) {
    fs.appendFileSync(logFilePath, line + '\n');
  }
}

// ---------------------------------------------------------------------------
// Enrichment snapshot management (mirrors scheduler logic)
// ---------------------------------------------------------------------------

function advanceLinescoreSnapshot(
  enrichmentState: EnrichmentState,
  currentLinescore: Linescore,
  retryPending: boolean
): void {
  if (!retryPending) {
    enrichmentState.lastLinescoreSnapshot = currentLinescore;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const teamAbbrev = resolveTeamAbbreviation(CONFIG.TEAM_ID);
  const captureStart = new Date().toISOString();
  log('Game capture starting', { team: teamAbbrev, teamId: CONFIG.TEAM_ID });

  let sessionDir: string | null = null;
  let ticksPath: string | null = null;
  let sessionPath: string | null = null;
  let seq = 0;
  let gamePk: number | null = null;
  let enrichmentState: EnrichmentState | null = null;
  let cachedPitcherStats: {
    pitcherId: number;
    enrichmentStats: PitcherGameStats;
    enrichmentPitchHistory: PitchEvent[];
  } | null = null;

  const writeSession = (): void => {
    if (sessionPath === null || gamePk === null) return;
    const session: CaptureSession = {
      gamePk,
      team: teamAbbrev,
      captureStart,
      captureEnd: new Date().toISOString(),
      tickCount: seq,
    };
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    log('Session saved', { path: sessionPath, tickCount: seq });
  };

  process.on('SIGINT', () => {
    log('\nCapture interrupted — writing session metadata');
    writeSession();
    process.exit(0);
  });

  // Loop exits via break (game final) or SIGINT.
  for (;;) {
    seq++;
    const tickStart = Date.now();
    const wallTime = new Date().toISOString();
    const elapsedMs =
      sessionDir !== null ? tickStart - new Date(captureStart).getTime() : 0;

    // ── 1. Schedule fetch ────────────────────────────────────────────────────
    let schedule: ScheduleResponse;
    let gameUpdate: GameUpdate | null;
    try {
      schedule = await fetchSchedule();
      gameUpdate = parseGameUpdate(schedule, CONFIG.TEAM_ID);
    } catch (err) {
      log('Schedule fetch failed — skipping tick', { err: String(err) });
      seq--;
      await delay(CONFIG.IDLE_POLL_INTERVAL * 1000);
      continue;
    }

    if (gameUpdate === null) {
      log('No active game found — waiting');
      seq--;
      await delay(CONFIG.IDLE_POLL_INTERVAL * 1000);
      continue;
    }

    // ── 2. One-time session directory setup when a game is first found ───────
    if (gamePk === null || gamePk !== gameUpdate.gamePk) {
      gamePk = gameUpdate.gamePk;
      const date = utcDateString();
      sessionDir = resolveSessionDir(date, gamePk);
      fs.mkdirSync(sessionDir, { recursive: true });
      ticksPath = path.join(sessionDir, 'ticks.ndjson');
      sessionPath = path.join(sessionDir, 'session.json');
      logFilePath = path.join(sessionDir, 'capture.log');
      const initial: CaptureSession = {
        gamePk,
        team: teamAbbrev,
        captureStart,
        captureEnd: null,
        tickCount: 0,
      };
      fs.writeFileSync(sessionPath, JSON.stringify(initial, null, 2));
      log('Capture session created', { dir: sessionDir, gamePk });
    }

    // ── 3. Active game context ───────────────────────────────────────────────
    const activeGame =
      schedule.dates?.[0]?.games.find((g) => g.gamePk === gameUpdate!.gamePk) ??
      null;
    const currentLinescore: Linescore | null = activeGame?.linescore ?? null;
    const currentGameDate: string | null = activeGame?.gameDate ?? null;
    const isFinal = gameUpdate.trackingMode === 'final';

    // ── 4. Enrichment state lifecycle ────────────────────────────────────────
    const isNewGame =
      enrichmentState === null || enrichmentState.gamePk !== gamePk;
    if (isNewGame && !isFinal && currentGameDate !== null) {
      if (enrichmentState !== null) {
        log('gamePk changed — resetting enrichment state', {
          from: enrichmentState.gamePk,
          to: gamePk,
        });
      }
      enrichmentState = createEnrichmentState(
        gamePk,
        toTimecode(currentGameDate)
      );
      log('Enrichment state initialised', { gamePk });
    }

    // ── 5. Determine what to fetch ───────────────────────────────────────────
    const shouldFetchAtBat =
      gameUpdate.trackingMode !== 'between-innings' &&
      gameUpdate.trackingMode !== 'final';

    const isFirstTick = enrichmentState?.lastLinescoreSnapshot === null;
    const shouldEnrich =
      enrichmentState !== null &&
      !isFirstTick &&
      (isFinal ||
        (currentLinescore !== null &&
          hasLinescoreDelta(
            currentLinescore,
            enrichmentState.lastLinescoreSnapshot
          )));

    // ── 6. Parallel API fetches ──────────────────────────────────────────────
    const liveFeedPromise: Promise<GameFeedLiveResponse | null> =
      shouldFetchAtBat
        ? fetchGameFeedLive(gameUpdate.gamePk).catch((err) => {
            log('gameFeedLive fetch failed', { err: String(err) });
            return null;
          })
        : Promise.resolve(null);

    const diffPatchPromise: Promise<GameFeedResponse | null> =
      shouldEnrich && enrichmentState !== null
        ? fetchGameFeed(
            enrichmentState.gamePk,
            enrichmentState.lastTimestamp
          ).catch((err) => {
            log('diffPatch fetch failed', { err: String(err) });
            return null;
          })
        : Promise.resolve(null);

    const [gameFeedLive, diffPatch] = await Promise.all([
      liveFeedPromise,
      diffPatchPromise,
    ]);

    // ── 7. Parse atBat ───────────────────────────────────────────────────────
    const atBat: AtBatState | null =
      gameFeedLive !== null && currentLinescore !== null
        ? parseCurrentPlay(gameFeedLive, currentLinescore)
        : null;

    // ── 8. Parse game events and advance enrichment cursor ───────────────────
    let gameEventsPayload: GameEventsPayload | null = null;
    let retryPending = false;

    if (enrichmentState !== null && shouldEnrich) {
      if (diffPatch === null) {
        retryPending = true;
        log('diffPatch returned empty or failed — will retry next tick', {
          gamePk,
        });
      } else {
        const events = parseFeedEvents(
          diffPatch,
          enrichmentState.gamePk,
          enrichmentState.lastProcessedAtBatIndex
        );
        if (events.length > 0) {
          gameEventsPayload = { gamePk: enrichmentState.gamePk, events };
          enrichmentState.lastProcessedAtBatIndex = Math.max(
            ...events.map((e) => e.atBatIndex)
          );
          log('game-events captured', { count: events.length });
        }
        enrichmentState.lastTimestamp = diffPatch.metaData.timeStamp;
      }
    }

    if (enrichmentState !== null && currentLinescore !== null) {
      advanceLinescoreSnapshot(enrichmentState, currentLinescore, retryPending);
    }

    // ── 9. Pitcher stats enrichment (mirrors scheduler cachedPitcherStats logic) ──
    if (gameUpdate.trackingMode === 'final') {
      cachedPitcherStats = null;
    }

    const pitcherId = gameUpdate.currentPitcher?.id ?? null;

    if (pitcherId !== null) {
      if (
        cachedPitcherStats === null ||
        cachedPitcherStats.pitcherId !== pitcherId
      ) {
        cachedPitcherStats = {
          pitcherId,
          enrichmentStats: ZERO_PITCHER_STATS,
          enrichmentPitchHistory: [],
        };
      }
      const allPlaysList = diffPatch?.liveData.plays.allPlays ?? null;
      if (allPlaysList !== null) {
        const deltaPitchHistory = allPlaysList
          .filter((play) => play.matchup.pitcher.id === pitcherId)
          .flatMap((play) =>
            play.playEvents
              .filter((ev) => ev.type === 'pitch')
              .map(mapPitchEvent)
          );
        cachedPitcherStats = {
          pitcherId,
          enrichmentStats: mergePitcherStats(
            cachedPitcherStats.enrichmentStats,
            deltaPitchHistory
          ),
          enrichmentPitchHistory: [
            ...cachedPitcherStats.enrichmentPitchHistory,
            ...deltaPitchHistory,
          ],
        };
      }
    }

    // Only include pitches from an in-progress (isComplete === false) at-bat.
    // A completed currentPlay's pitches are already covered by the next
    // diffPatch window — including them here would double-count them.
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

    const mergedStats =
      cachedPitcherStats !== null
        ? mergePitcherStats(
            cachedPitcherStats.enrichmentStats,
            currentAtBatPitches
          )
        : null;

    const pitchHistory: PitchEvent[] =
      cachedPitcherStats !== null
        ? [...cachedPitcherStats.enrichmentPitchHistory, ...currentAtBatPitches]
        : [];

    // ── 10a. Build full game update with atBat and pitcher stats ─────────────
    const fullGameUpdate: GameUpdate = {
      ...gameUpdate,
      atBat,
      pitchHistory,
      currentPitcher:
        gameUpdate.currentPitcher !== null && mergedStats !== null
          ? { ...gameUpdate.currentPitcher, ...mergedStats }
          : gameUpdate.currentPitcher,
    };

    // ── 10b. Final-game enrichment: boxscore + game summary ──────────────────
    let boxscore: BoxscoreResponse | null = null;
    let gameSummary: GameSummary | null = null;

    if (isFinal && diffPatch !== null) {
      try {
        boxscore = await fetchBoxscore(gamePk);
      } catch (err) {
        log('Boxscore fetch failed', { err: String(err) });
      }
      try {
        gameSummary = buildGameSummary(
          gamePk,
          fullGameUpdate.score,
          fullGameUpdate.inning.number,
          fullGameUpdate.isExtraInnings,
          diffPatch,
          boxscore ?? { topPerformers: [] },
          null,
          CONFIG.TEAM_ID
        );
        log('game-summary captured');
      } catch (err) {
        log('buildGameSummary failed', { err: String(err) });
      }
    }

    // ── 11. Write tick to NDJSON ─────────────────────────────────────────────
    const tick: CapturedTick = {
      seq,
      wallTime,
      elapsedMs,
      api: { schedule, gameFeedLive, diffPatch, boxscore },
      emitted: {
        gameUpdate: fullGameUpdate,
        gameEvents: gameEventsPayload,
        gameSummary,
      },
    };

    if (ticksPath !== null) {
      fs.appendFileSync(ticksPath, JSON.stringify(tick) + '\n');
    }

    log(`Tick ${seq} captured`, {
      gamePk,
      trackingMode: gameUpdate.trackingMode,
      hasAtBat: atBat !== null,
      eventCount: gameEventsPayload?.events.length ?? 0,
    });

    // ── 12. Stop on game final ───────────────────────────────────────────────
    if (isFinal) {
      log('Game is final — capture complete');
      break;
    }

    // ── 13. Wait for next poll ───────────────────────────────────────────────
    const intervalMs = getNextIntervalMs(gameUpdate.trackingMode);
    log(`Next poll in ${intervalMs / 1000}s`);
    await delay(intervalMs);
  }

  writeSession();
  log('Capture finished', { gamePk, tickCount: seq, dir: sessionDir });
}

main().catch((err: unknown) => {
  console.error('Capture script failed:', err);
  process.exit(1);
});
