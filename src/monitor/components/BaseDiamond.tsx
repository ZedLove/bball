import { Box, Text } from 'ink';
import type { AtBatState } from '../../server/socket-events.ts';
import { THEME } from '../theme.ts';

const EMPTY = '◇';
const OCCUPIED = '◆';

interface BaseDiamondProps {
  first: AtBatState['first'];
  second: AtBatState['second'];
  third: AtBatState['third'];
}

export function BaseDiamond({ first, second, third }: BaseDiamondProps) {
  const b1 = first !== null ? OCCUPIED : EMPTY;
  const b2 = second !== null ? OCCUPIED : EMPTY;
  const b3 = third !== null ? OCCUPIED : EMPTY;

  const colorFirst = first !== null ? THEME.baseOccupied : THEME.baseEmpty;
  const colorSecond = second !== null ? THEME.baseOccupied : THEME.baseEmpty;
  const colorThird = third !== null ? THEME.baseOccupied : THEME.baseEmpty;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={THEME.border}
      paddingX={1}
      width={12}
    >
      <Text color={THEME.fgDim}>{'Bases'}</Text>
      {/* Row 1: 2nd base (centered) */}
      <Box>
        <Text>{'  '}</Text>
        <Text color={colorSecond}>{b2}</Text>
      </Box>
      {/* Row 2: 3rd base (left) and 1st base (right) */}
      <Box>
        <Text color={colorThird}>{b3}</Text>
        <Text>{'   '}</Text>
        <Text color={colorFirst}>{b1}</Text>
      </Box>
    </Box>
  );
}
