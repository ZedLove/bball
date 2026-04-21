import { Box, Text } from 'ink';
import type { CelebrationState } from '../types.ts';
import { CELEBRATION_DURATION_MS, CELEBRATION_FRAME_MS } from '../types.ts';
import { THEME } from '../theme.ts';

// ---------------------------------------------------------------------------
// Frame count derived from timing constants (no magic numbers)
// ---------------------------------------------------------------------------

const TOTAL_FRAMES = Math.ceil(CELEBRATION_DURATION_MS / CELEBRATION_FRAME_MS);

// Stage boundaries (frame indices)
const STAGE_LAUNCH_END = Math.floor(TOTAL_FRAMES * 0.27); // frames 0–9
const STAGE_BURST_END = Math.floor(TOTAL_FRAMES * 0.65); // frames 10–24
// Frames 25–TOTAL_FRAMES-1 are the fade/text stage.

// ---------------------------------------------------------------------------
// Positive (warm) animation — home run or win for the preferred team
// ---------------------------------------------------------------------------

// Each stage is an array of rows. All rows should be the same width (padded).
const POSITIVE_LAUNCH: string[][] = [
  ['         *         '],
  ['        * *        '],
  ['       *   *       '],
  ['      *     *      '],
  ['     *  ✦ ✦  *     '],
  ['    *  ✦   ✦  *    '],
  ['   *  ✦  ★  ✦  *   '],
  ['  *  ✦  ★ ★  ✦  *  '],
  [' *  ✦  ★ ✸ ★  ✦  * '],
  ['*  ✦  ★ ✸ ✹ ★  ✦  *'],
];

const POSITIVE_BURST: string[][] = [
  ['  ✸   ✦   ✸  ', '    ✺ ★ ✺    ', '  ✦   ✹   ✦  '],
  ['✦   ✸   ✸   ✦', '  ✺   ✸   ✺  ', '✸   ✦   ✦   ✸'],
  ['  ✹ ✦ ✸ ✦ ✹  ', ' ✸  ✦ ★ ✦  ✸ ', '  ✦ ✸ ✦ ✸ ✦  '],
  ['✸ ✦   ✹   ✦ ✸', '  ✸  ★ ★  ✸  ', '✦ ✸   ✦   ✸ ✦'],
  ['✦   ✺ ★ ✺   ✦', '  ✹  ✸ ✸  ✹  ', '★   ✦   ✦   ★'],
  ['  ✸   ✦   ✸  ', ' ✦  ✺   ✺  ✦ ', '  ✺   ★   ✺  '],
  ['✺ ✦   ✸   ✦ ✺', '✦   ✸   ✸   ✦', '✸ ✺   ✦   ✺ ✸'],
  ['  ✦ ✸ ★ ✸ ✦  ', '✸   ✦ ✹ ✦   ✸', '  ✸ ✦ ✸ ✦ ✸  '],
  ['✸   ✦   ✦   ✸', '  ✺  ✸ ✸  ✺  ', '✦   ✸   ✸   ✦'],
  ['  ✦   ✺   ✦  ', '✺   ★   ★   ✺', '  ✸   ✦   ✸  '],
  ['✦ ✸   ✦   ✸ ✦', '✸   ✺ ★ ✺   ✸', '✦ ✸   ✦   ✸ ✦'],
  ['  ✺ ✦ ✸ ✦ ✺  ', '✦   ✸ ✹ ✸   ✦', '  ✺ ✦ ✸ ✦ ✺  '],
  ['✸   ✦   ✦   ✸', '  ✦  ✺ ✺  ✦  ', '✸   ✦   ✦   ✸'],
  ['  ✦   ✸   ✦  ', '✸   ✦   ✦   ✸', '  ✦   ✸   ✦  '],
  ['✦   ✺   ✺   ✦', '  ✸  ✦ ✦  ✸  ', '✦   ✺   ✺   ✦'],
];

const POSITIVE_FADE: string[][] = [
  ['  ·  ✦  ·  ✦  ·  ', '·  ✸    ✸    ✸  ·', '  ·  ✦  ·  ✦  ·  '],
  ['    ·   ✦   ·    ', '  ✦   ·   ·   ✦  ', '    ·   ✦   ·    '],
  ['      ·   ·      ', '    ✦   ·   ✦    ', '      ·   ·      '],
  ['        ·        ', '      ✦   ✦      ', '        ·        '],
  ['                 ', '       · ·       ', '                 '],
  ['                 ', '        ·        ', '                 '],
];

// ---------------------------------------------------------------------------
// Negative (cold) animation — opponent HR or preferred team loss
// ---------------------------------------------------------------------------

// Falling sparks that drip down and fade
const NEGATIVE_LAUNCH: string[][] = [
  [' ·   ·   ·   ·   · '],
  ['  ·   ·   ·   ·   ·'],
  ['·  ↓   ·   ·   ↓  ·'],
  [' ·  ↓   ·   ↓   ·  '],
  ['  ·   ↓   ↓   ·   ·'],
  ['·   ·   ↓ ↓   ·   ·'],
  [' ·   ·  ↓↓↓  ·   · '],
  ['  ·   ↓ ↓↓↓ ↓   ·  '],
  ['·   ·  ↓↓ ↓↓  ·   ·'],
  [' ·  ↓ ↓↓   ↓↓ ↓  · '],
];

const NEGATIVE_BURST: string[][] = [
  ['  ,   ·   ,  ', '    · , ·    ', '  ,   ·   ,  '],
  ['·   ,   ,   ·', '  ,   ↓   ,  ', '·   ,   ,   ·'],
  ['  , ↓ , ↓ ,  ', ' ,  · , ·  , ', '  , ↓ , ↓ ,  '],
  [',   ·   ·   ,', '  ,  ↓ ↓  ,  ', ',   ·   ·   ,'],
  ['·   , ↓ ,   ·', '  ,  · ·  ,  ', '·   , ↓ ,   ·'],
  ['  ,   ·   ,  ', ' ·  ,   ,  · ', '  ,   ·   ,  '],
  [', ·   ,   · ,', '·   ,   ,   ·', ', ·   ,   · ,'],
  ['  · , ↓ , ·  ', ',   · , ·   ,', '  · , ↓ , ·  '],
  [',   ·   ·   ,', '  ,  · ·  ,  ', ',   ·   ·   ,'],
  ['  ·   ,   ·  ', ',   ·   ·   ,', '  ·   ,   ·  '],
  ['·   ,   ,   ·', '  ,  ↓ ↓  ,  ', '·   ,   ,   ·'],
  ['  , · ↓ · ,  ', '·   , · ,   ·', '  , · ↓ · ,  '],
  [',   ·   ·   ,', '  ,  · ·  ,  ', ',   ·   ·   ,'],
  ['  ·   ,   ·  ', ',   ·   ·   ,', '  ·   ,   ·  '],
  ['·   ,   ,   ·', '  ·   ,   ·  ', '·   ,   ,   ·'],
];

const NEGATIVE_FADE: string[][] = [
  ['  ·       ·  ', '·       ·    ', '  ·       ·  '],
  ['    ·       ·', '        ·    ', '  ·          '],
  ['          ·  ', '    ·        ', '             '],
  ['             ', '          ·  ', '             '],
  ['             ', '             ', '             '],
  ['             ', '             ', '             '],
];

// ---------------------------------------------------------------------------
// Frame resolution helpers
// ---------------------------------------------------------------------------

/**
 * Given a frame index and a stage's frame array, returns the appropriate
 * row array for that stage frame. Clamps to the last entry.
 */
function stageRows(frames: string[][], stageFrame: number): string[] {
  return frames[Math.min(stageFrame, frames.length - 1)];
}

/** Positive colour cycling — warm gold/teal that cools as frames progress. */
function positiveColor(frame: number): string {
  const warmCycle = [
    THEME.homeRun,
    THEME.scoring,
    THEME.fgBright,
    THEME.borderAccent,
    THEME.zoneInPlay,
  ];
  // Fade stage: dim
  if (frame >= STAGE_BURST_END) return THEME.fgDim;
  return warmCycle[frame % warmCycle.length];
}

/** Negative colour cycling — blue-gray, muted. */
function negativeColor(frame: number): string {
  if (frame >= STAGE_BURST_END) return THEME.fgDim;
  const coolCycle = [THEME.fgDim, THEME.border, THEME.fgDim, THEME.border];
  return coolCycle[frame % coolCycle.length];
}

// ---------------------------------------------------------------------------
// Victory / condolence text shown in the fade stage
// ---------------------------------------------------------------------------

function headerText(celebration: CelebrationState): string {
  if (celebration.kind === 'home-run') {
    if (celebration.polarity === 'positive') {
      const name = celebration.batterName || 'HOME RUN';
      return `★  ${name.toUpperCase()}  ★`;
    }
    const name = celebration.batterName || 'HOME RUN';
    return `↓  ${name} goes deep  ↓`;
  }
  if (celebration.kind === 'win') return '★  WE WIN!  ★';
  return '☁  Tough loss. Next time.  ☁';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CelebrationPanelProps {
  celebration: CelebrationState;
}

export function CelebrationPanel({ celebration }: CelebrationPanelProps) {
  const { frame, polarity } = celebration;

  const isPositive = polarity === 'positive';
  const color = isPositive ? positiveColor(frame) : negativeColor(frame);

  // Determine which stage rows to render.
  let rows: string[];
  if (frame < STAGE_LAUNCH_END) {
    const stage = isPositive ? POSITIVE_LAUNCH : NEGATIVE_LAUNCH;
    rows = stageRows(stage, frame);
  } else if (frame < STAGE_BURST_END) {
    const stage = isPositive ? POSITIVE_BURST : NEGATIVE_BURST;
    rows = stageRows(stage, frame - STAGE_LAUNCH_END);
  } else {
    const stage = isPositive ? POSITIVE_FADE : NEGATIVE_FADE;
    rows = stageRows(stage, frame - STAGE_BURST_END);
  }

  const isFadeStage = frame >= STAGE_BURST_END;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingY={1}
      marginTop={1}
    >
      {rows.map((row, i) => (
        <Text key={i} color={color}>
          {row}
        </Text>
      ))}
      {isFadeStage && (
        <Box marginTop={1}>
          <Text
            color={isPositive ? THEME.homeRun : THEME.fgDim}
            bold={isPositive}
          >
            {headerText(celebration)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Export stage boundaries for unit tests
export { STAGE_LAUNCH_END, STAGE_BURST_END, TOTAL_FRAMES };
