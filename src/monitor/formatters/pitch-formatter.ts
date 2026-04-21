const CALL_ABBREVIATIONS: Record<string, string> = {
  Ball: 'B',
  'Called Strike': 'CS',
  'Swinging Strike': 'SS',
  'Swinging Strike (Blocked)': 'SS(B)',
  Foul: 'F',
  'Foul Tip': 'FT',
  'Foul Bunt': 'FB',
  'In play, out(s)': 'IP(O)',
  'In play, run(s)': 'IP(R)',
  'In play, no out': 'IP',
  'Intent Ball': 'IB',
  Pitchout: 'PO',
  'Automatic Ball': 'AB',
  'Automatic Strike': 'AS',
  'No Pitch': 'NP',
  'Missed Bunt': 'MB',
  'Foul Pitchout': 'FP',
  'Hit By Pitch': 'HBP',
};

export function abbreviateCall(call: string): string {
  const abbrev = CALL_ABBREVIATIONS[call];
  if (abbrev === undefined) {
    console.warn(`abbreviateCall: unknown call string "${call}"`);
    return '??';
  }
  return abbrev;
}
