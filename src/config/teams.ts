export interface TeamEntry {
  id: number;
  name: string;
}

/**
 * All 30 MLB teams keyed by official abbreviation.
 * IDs sourced from https://statsapi.mlb.com/api/v1/teams?sportId=1
 */
export const TEAMS: Record<string, TeamEntry> = {
  ARI: { id: 109, name: 'Arizona Diamondbacks' },
  ATL: { id: 144, name: 'Atlanta Braves' },
  BAL: { id: 110, name: 'Baltimore Orioles' },
  BOS: { id: 111, name: 'Boston Red Sox' },
  CHC: { id: 112, name: 'Chicago Cubs' },
  CWS: { id: 145, name: 'Chicago White Sox' },
  CIN: { id: 113, name: 'Cincinnati Reds' },
  CLE: { id: 114, name: 'Cleveland Guardians' },
  COL: { id: 115, name: 'Colorado Rockies' },
  DET: { id: 116, name: 'Detroit Tigers' },
  HOU: { id: 117, name: 'Houston Astros' },
  KC: { id: 118, name: 'Kansas City Royals' },
  LAA: { id: 108, name: 'Los Angeles Angels' },
  LAD: { id: 119, name: 'Los Angeles Dodgers' },
  MIA: { id: 146, name: 'Miami Marlins' },
  MIL: { id: 158, name: 'Milwaukee Brewers' },
  MIN: { id: 142, name: 'Minnesota Twins' },
  NYM: { id: 121, name: 'New York Mets' },
  NYY: { id: 147, name: 'New York Yankees' },
  ATH: { id: 133, name: 'Athletics' },
  PHI: { id: 143, name: 'Philadelphia Phillies' },
  PIT: { id: 134, name: 'Pittsburgh Pirates' },
  SD: { id: 135, name: 'San Diego Padres' },
  SF: { id: 137, name: 'San Francisco Giants' },
  SEA: { id: 136, name: 'Seattle Mariners' },
  STL: { id: 138, name: 'St. Louis Cardinals' },
  TB: { id: 139, name: 'Tampa Bay Rays' },
  TEX: { id: 140, name: 'Texas Rangers' },
  TOR: { id: 141, name: 'Toronto Blue Jays' },
  WSH: { id: 120, name: 'Washington Nationals' },
};
