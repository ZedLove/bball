import { Box, Text } from 'ink';
import type { GameSummary } from '../../server/socket-events.ts';
import type { GameUpdate } from '../../scheduler/parser.ts';
import { THEME } from '../theme.ts';

interface GameSummaryPanelProps {
  summary: GameSummary;
  teams: GameUpdate['teams'] | null;
}

function formatGameTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function GameSummaryPanel({ summary, teams }: GameSummaryPanelProps) {
  const awayAbbrev = teams?.away.abbreviation ?? 'Away';
  const homeAbbrev = teams?.home.abbreviation ?? 'Home';

  const inningLabel = summary.isExtraInnings
    ? `${summary.innings} innings (extras)`
    : `${summary.innings} innings`;

  const { winner, loser, save } = summary.decisions;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={THEME.borderAccent}
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      <Text color={THEME.borderAccent} bold>
        {'Game Final'}
      </Text>

      <Box marginTop={1}>
        <Text color={THEME.fgBright} bold>
          {`${awayAbbrev} ${summary.finalScore.away} – ${homeAbbrev} ${summary.finalScore.home}`}
        </Text>
        <Text color={THEME.fgDim}>{`  │  ${inningLabel}`}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={THEME.fg}>{`W: ${winner.fullName}  `}</Text>
        <Text color={THEME.fg}>{`L: ${loser.fullName}`}</Text>
        {save !== null && (
          <Text color={THEME.fg}>{`  S: ${save.fullName}`}</Text>
        )}
      </Box>

      {summary.topPerformers.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={THEME.fgDim}>{'Top Performers:'}</Text>
          {summary.topPerformers.map((perf) => (
            <Text key={perf.player.id} color={THEME.fg}>
              {'  '}
              {perf.player.fullName}
              {' — '}
              {perf.summary}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={THEME.fgDim}>{'Boxscore: '}</Text>
        <Text color={THEME.fg}>{summary.boxscoreUrl}</Text>
      </Box>

      <Box marginTop={1}>
        {summary.nextGame !== null ? (
          <Box flexDirection="column">
            <Text color={THEME.fgDim}>
              {'Next: '}
              <Text color={THEME.fg}>
                {`${summary.nextGame.opponent.abbreviation}  │  ${formatGameTime(summary.nextGame.gameTime)}  │  ${summary.nextGame.venue}`}
              </Text>
            </Text>
            <Text color={THEME.fgDim}>
              {'  Probable: '}
              <Text color={THEME.fg}>
                {[
                  summary.nextGame.probablePitchers.away?.fullName ?? 'TBD',
                  summary.nextGame.probablePitchers.home?.fullName ?? 'TBD',
                ].join(' vs ')}
              </Text>
            </Text>
          </Box>
        ) : (
          <Text color={THEME.fgDim}>{'Next: No upcoming game found'}</Text>
        )}
      </Box>
    </Box>
  );
}
