/**
 * Shared utilities for capture analysis scripts.
 * Import from here rather than duplicating across individual scripts.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import type { CapturedTick } from '../../src/dev/capture-types.ts';

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * Async generator that streams a ticks.ndjson file one parsed tick at a time.
 * Memory-efficient — never holds the full file in memory.
 */
export async function* streamTicks(
  filePath: string
): AsyncGenerator<CapturedTick> {
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as CapturedTick;
  }
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const WIDTH = 70;
const THICK = '═'.repeat(WIDTH);
const THIN = '─'.repeat(WIDTH);

export function section(title: string): void {
  console.log(`\n${THICK}`);
  console.log(title);
  console.log(THICK);
}

export function rule(): void {
  console.log(THIN);
}

export function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ⚠  ${msg}`);
}

export function err(msg: string): void {
  console.log(`  ✗ ${msg}`);
}

// ---------------------------------------------------------------------------
// Common formatters
// ---------------------------------------------------------------------------

export function fmtInning(
  inning: { number: number; half: string; ordinal: string } | undefined
): string {
  if (!inning) return '?';
  return `${inning.half} ${inning.ordinal}`;
}

export function fmtScore(
  score: { away: number; home: number } | undefined
): string {
  if (!score) return '?-?';
  return `${score.away}-${score.home}`;
}

export function fmtSeq(seq: number): string {
  return seq.toString().padStart(4);
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export function requireArg(usage: string): string {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(`Usage: npx tsx ${usage} <ticks.ndjson>`);
    process.exit(1);
  }
  return filePath;
}
