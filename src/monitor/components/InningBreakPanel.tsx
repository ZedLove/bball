import { Box, Text } from 'ink';
import type { InningBreakSummary } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

interface InningBreakPanelProps {
  summary: InningBreakSummary;
}

export function InningBreakPanel({ summary }: InningBreakPanelProps) {
  const {
    inningLabel,
    scoringPlays,
    upcomingBatters,
    upcomingBattingTeam,
    pitcher,
  } = summary;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.borderAccent}
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      <Text color={THEME.borderAccent} bold>
        {`⏸  Between Innings — ${inningLabel}  |  ${upcomingBattingTeam} batting next`}
      </Text>

      {/* Scoring plays */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={THEME.scoring} bold>
          {'Recent Runs'}
        </Text>
        {scoringPlays.length === 0 ? (
          <Text color={THEME.fgDim}>{'No runs scored yet.'}</Text>
        ) : (
          scoringPlays.map((play, i) => (
            <Text key={i} color={THEME.fg}>
              {`${play.halfInning === 'top' ? '▲' : '▼'}${play.inning}  ${play.description}  (+${play.rbi})`}
            </Text>
          ))
        )}
      </Box>

      {/* Upcoming batters */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={THEME.borderAccent} bold>
          {'Up Next'}
        </Text>
        {upcomingBatters.map((batter, i) => (
          <Text key={i} color={THEME.fg}>
            {`${batter.lineupPosition}. ${batter.fullName}  ${batter.today.hits}-${batter.today.atBats}  ${batter.season.avg} AVG  ${batter.season.ops} OPS`}
          </Text>
        ))}
      </Box>

      {/* Pitcher section — omitted when pitcher is null */}
      {pitcher !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={THEME.substitution} bold>
            {'Pitching'}
          </Text>
          {pitcher.role === 'starter' ? (
            <Text color={THEME.fg}>
              {`${pitcher.fullName}  ${pitcher.gameStats.inningsPitched} IP  ${pitcher.gameStats.earnedRuns} ER  ${pitcher.gameStats.strikeOuts} K`}
            </Text>
          ) : (
            <Text color={THEME.fg}>
              {`${pitcher.fullName} (RP)  ${pitcher.seasonStats.era} ERA  ${pitcher.seasonStats.strikeoutsPer9} K/9`}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
