/**
 * Behavioral tests for the Results overlay (Task 7.3).
 *
 * These cover the CONTRACT, not animation internals:
 *   • the number of FILLED stars matches `scoreLevel(mistakes/hints/band)`;
 *   • the score, mistakes, and hints values are shown;
 *   • "Sledeći" calls `onNext`;
 *   • the SAVE side-effect (`onSave`) is invoked once, on show, with the exact
 *     `{ levelId, mode, stars, score, mistakes, hintsUsed }` payload.
 *
 * The save seam is INJECTED (mock `onSave`), so no SQLite is touched here.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import '@/i18n'; // initialize the i18next instance so useTranslation resolves keys
import { scoreLevel } from '@/game/scoring';
import { ThemeProvider } from '@/theme';

import { Results, type ResultsProps } from './Results';

// AsyncStorage is pulled in transitively by the theme/settings; use the mock.
jest.mock(
  '@react-native-async-storage/async-storage',
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

async function renderResults(props: Partial<ResultsProps> = {}) {
  const onNext = props.onNext ?? jest.fn();
  const onSave = props.onSave ?? jest.fn();
  const merged: ResultsProps = {
    levelId: 'lvl-1',
    mode: 'basic',
    difficultyBand: 1,
    mistakes: 0,
    hintsUsed: 0,
    onNext,
    onSave,
    ...props,
  };
  // RNTL 14 + RN new architecture: the initial render must be awaited so the
  // `screen` query API is populated and mount effects (the save-on-show) run.
  await act(async () => {
    render(
      <ThemeProvider>
        <Results {...merged} />
      </ThemeProvider>,
    );
  });
  return { onNext, onSave, props: merged };
}

/** Count the FILLED star slots currently rendered. */
function filledStarCount(): number {
  return screen.queryAllByLabelText('star-filled').length;
}

describe('Results', () => {
  it('renders 5 filled stars for a clean solve (0 mistakes, 0 hints)', async () => {
    await renderResults({ mistakes: 0, hintsUsed: 0, difficultyBand: 1 });
    const { stars } = scoreLevel({ mistakes: 0, hintsUsed: 0, difficultyBand: 1 });
    expect(stars).toBe(5);
    expect(filledStarCount()).toBe(5);
    expect(screen.queryAllByLabelText('star-empty')).toHaveLength(0);
  });

  it('renders fewer filled stars when there were mistakes', async () => {
    // Band 1: thresholds [1,3,6,10] → 5 mistakes drops to 2★.
    const mistakes = 5;
    const { stars } = scoreLevel({ mistakes, hintsUsed: 0, difficultyBand: 1 });
    expect(stars).toBeLessThan(5);
    await renderResults({ mistakes, hintsUsed: 0, difficultyBand: 1 });
    expect(filledStarCount()).toBe(stars);
    expect(screen.queryAllByLabelText('star-empty')).toHaveLength(5 - stars);
  });

  it('shows the score, mistakes, and hints values', async () => {
    const { score } = scoreLevel({ mistakes: 2, hintsUsed: 1, difficultyBand: 3 });
    await renderResults({ mistakes: 2, hintsUsed: 1, difficultyBand: 3 });

    expect(screen.getByTestId('results-score').props.children.join('')).toContain(
      String(score),
    );
    expect(screen.getByTestId('results-mistakes').props.children.join('')).toContain('2');
    expect(screen.getByTestId('results-hints').props.children.join('')).toContain('1');
  });

  it('"Sledeći" (next) button calls onNext', async () => {
    const { onNext } = await renderResults();
    await act(async () => {
      fireEvent.press(screen.getByText('Sledeće'));
    });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('saves the result ON SHOW with the exact payload (queues sync via synced=0)', async () => {
    const onSave = jest.fn();
    await renderResults({
      levelId: 'sample-basic-1',
      mode: 'advanced',
      mistakes: 2,
      hintsUsed: 1,
      difficultyBand: 4,
      onSave,
    });
    const { stars, score } = scoreLevel({
      mistakes: 2,
      hintsUsed: 1,
      difficultyBand: 4,
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      levelId: 'sample-basic-1',
      mode: 'advanced',
      stars,
      score,
      mistakes: 2,
      hintsUsed: 1,
    });
  });

  it('saves only once even if re-rendered', async () => {
    const onSave = jest.fn();
    const { props } = await renderResults({ onSave });
    await act(async () => {
      screen.rerender(
        <ThemeProvider>
          <Results {...props} />
        </ThemeProvider>,
      );
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
