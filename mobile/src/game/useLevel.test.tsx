/**
 * Tests for the `useLevel` loader hook (Task 5.4): cache → sample fallback.
 *
 * We drive the hook through a tiny probe component (so its `useEffect` runs)
 * and inject the DB seams (`openDb` / `fetchNextLevel`) so no native sqlite
 * binding is needed. We assert the resolved status/source/level number.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { PlayableLevel } from '@/db/levelRepo';
import type { SqliteDb } from '@/db/sqlite';

import { sampleLevel, SAMPLE_LEVEL_ID } from './sampleLevel';
import { useLevel, type UseLevelArgs } from './useLevel';

const fakeDb = {} as unknown as SqliteDb;

function Probe({
  args,
  deps,
}: {
  args: UseLevelArgs;
  deps?: Parameters<typeof useLevel>[1];
}) {
  const state = useLevel(args, deps);
  if (state.status === 'loading') return <Text testID="out">loading</Text>;
  return (
    <Text testID="out">
      {`${state.source}:${state.levelNumber}:${state.level.words.length}`}
    </Text>
  );
}

const ARGS: UseLevelArgs = { language: 'sr', script: 'latin' };

describe('useLevel', () => {
  it('falls back to the bundled sample when the cache is empty', async () => {
    render(
      <Probe
        args={ARGS}
        deps={{
          openDb: async () => fakeDb,
          fetchNextLevel: async () => null, // cache empty
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent(
        `sample:1:${sampleLevel.words.length}`,
      ),
    );
  });

  it('plays the cached level when one exists', async () => {
    const cached: PlayableLevel = {
      id: 'lvl-42',
      mode: 'basic',
      languageId: 'sr',
      script: 'lat',
      levelNumber: 42,
      difficultyBand: 1,
      gridWidth: sampleLevel.width,
      gridHeight: sampleLevel.height,
      gridData: sampleLevel, // reuse the sample shape as a valid GridData
    };
    render(
      <Probe
        args={ARGS}
        deps={{
          openDb: async () => fakeDb,
          fetchNextLevel: async () => cached,
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent(
        `cache:42:${sampleLevel.words.length}`,
      ),
    );
  });

  it('falls back to the sample when the DB cannot be opened', async () => {
    render(
      <Probe
        args={ARGS}
        deps={{
          openDb: async () => {
            throw new Error('no native sqlite');
          },
          fetchNextLevel: async () => null,
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent(
        `sample:1:${sampleLevel.words.length}`,
      ),
    );
  });

  it('exposes a stable sample level id', () => {
    expect(SAMPLE_LEVEL_ID).toBe('sample-basic-1');
  });
});
