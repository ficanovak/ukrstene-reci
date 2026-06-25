/**
 * Game screen route (`game/[mode]`).
 *
 * Branches on the `mode` route param:
 *   • `advanced` → the playable Advanced (letter-palette) mode (Task 6.3).
 *   • everything else → the playable Basic mode (Task 5.4, `<BasicGame/>`).
 */
import { useLocalSearchParams } from 'expo-router';

import { AdvancedGame } from '@/screens/AdvancedGame';
import { BasicGame } from '@/screens/BasicGame';

export default function GameScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();

  if (mode === 'advanced') {
    return <AdvancedGame />;
  }
  return <BasicGame />;
}
