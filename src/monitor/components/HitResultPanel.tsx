import { Box, Text } from 'ink';
import type { HitDisplay } from '../types.ts';
import type { VenueFieldInfo } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';
import { SprayChart } from './SprayChart.tsx';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTrajectory(trajectory: string | null): string {
  if (!trajectory) return '';
  return trajectory
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatStat(
  label: string,
  value: number | null,
  suffix: string
): string | null {
  if (value === null) return null;
  return `${label}: ${value.toFixed(1)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HitResultPanelProps {
  lastHit: HitDisplay | null;
  venueFieldInfo?: VenueFieldInfo | null;
}

export function HitResultPanel({
  lastHit,
  venueFieldInfo = null,
}: HitResultPanelProps) {
  if (lastHit === null) {
    return (
      <Box flexDirection="row" marginTop={1} gap={2}>
        <SprayChart
          hitData={null}
          isHomeRun={false}
          venueFieldInfo={venueFieldInfo}
        />
      </Box>
    );
  }

  const { hitData, batter, eventType, isHomeRun } = lastHit;

  const accentColor = isHomeRun ? THEME.homeRun : THEME.zoneInPlay;

  const trajectoryLabel = formatTrajectory(hitData.trajectory);
  const distanceLine =
    hitData.totalDistance !== null
      ? `${hitData.totalDistance.toFixed(0)} ft`
      : null;

  const headerParts = [eventType, trajectoryLabel].filter(Boolean);
  if (distanceLine) headerParts.push(distanceLine);

  const exitVeloLine = formatStat('Exit Velocity', hitData.launchSpeed, ' mph');
  const launchAngleLine = formatStat('Launch Angle', hitData.launchAngle, '°');
  const hardnessLine = hitData.hardness
    ? `Contact: ${hitData.hardness.charAt(0).toUpperCase()}${hitData.hardness.slice(1)}`
    : null;

  return (
    <Box flexDirection="row" marginTop={1} gap={2}>
      <SprayChart
        hitData={hitData}
        isHomeRun={isHomeRun}
        venueFieldInfo={venueFieldInfo}
      />
      <Box flexDirection="column" paddingTop={1}>
        <Text color={accentColor} bold>
          {headerParts.join('  ·  ')}
        </Text>
        <Text color={THEME.fgDim}>
          {'◆  '}
          <Text color={THEME.fg}>{batter.fullName}</Text>
        </Text>
        {exitVeloLine !== null && <Text color={THEME.fg}>{exitVeloLine}</Text>}
        {launchAngleLine !== null && (
          <Text color={THEME.fg}>{launchAngleLine}</Text>
        )}
        {hardnessLine !== null && (
          <Text color={THEME.fgDim}>{hardnessLine}</Text>
        )}
        {hitData.coordinates === null && (
          <Text color={THEME.fgDim}>{'No spray chart data'}</Text>
        )}
      </Box>
    </Box>
  );
}
