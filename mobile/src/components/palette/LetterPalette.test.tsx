/**
 * Behavioral tests for the Advanced-mode letter palette (Task 6.2).
 *
 * The palette is PURELY PRESENTATIONAL: it renders up to 5 amber letter tiles
 * plus a Submit pill and emits `onSelectTile`/`onSubmit`. The advanced engine
 * (wired by Task 6.3's screen) owns the placement state; these tests only cover
 * tile rendering, selection callbacks, the selected-state encoding, and submit
 * (label + disabled). Tap-to-place is the baseline interaction — board cell
 * placement is the screen's Grid `onCellPress`, not this component.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { i18n } from '@/i18n';
import { ThemeProvider } from '@/theme';

import { LetterPalette } from './LetterPalette';

function renderPalette(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('LetterPalette', () => {
  it('renders one tile per letter (≤5), each showing its grapheme', async () => {
    const letters = ['A', 'B', 'C'];
    await renderPalette(
      <LetterPalette
        letters={letters}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    letters.forEach((g, i) => {
      const tile = screen.getByTestId(`palette-tile-${i}`);
      expect(tile).toBeTruthy();
      expect(screen.getByText(g)).toBeTruthy();
    });
  });

  it('renders a digraph (NJ) as a single tile showing "NJ"', async () => {
    await renderPalette(
      <LetterPalette
        letters={['NJ']}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('palette-tile-0')).toBeTruthy();
    expect(screen.getByText('NJ')).toBeTruthy();
  });

  it('calls onSelectTile with the tapped tile index', async () => {
    const onSelectTile = jest.fn();
    await renderPalette(
      <LetterPalette
        letters={['A', 'B', 'C']}
        selectedIndex={null}
        onSelectTile={onSelectTile}
        onSubmit={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('palette-tile-1'));
    expect(onSelectTile).toHaveBeenCalledTimes(1);
    expect(onSelectTile).toHaveBeenCalledWith(1);
  });

  it('marks the selected tile (and only it) as selected', async () => {
    await renderPalette(
      <LetterPalette
        letters={['A', 'B', 'C']}
        selectedIndex={2}
        onSelectTile={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('palette-tile-2').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('palette-tile-0').props.accessibilityState?.selected).toBe(false);
    expect(screen.getByTestId('palette-tile-1').props.accessibilityState?.selected).toBe(false);
  });

  it('calls onSubmit when the submit button is pressed', async () => {
    const onSubmit = jest.fn();
    await renderPalette(
      <LetterPalette
        letters={['A']}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(screen.getByTestId('palette-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit when submitDisabled', async () => {
    const onSubmit = jest.fn();
    await renderPalette(
      <LetterPalette
        letters={['A']}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={onSubmit}
        submitDisabled
      />,
    );
    const submit = screen.getByTestId('palette-submit');
    expect(submit.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the localized submit label by default', async () => {
    await renderPalette(
      <LetterPalette
        letters={['A']}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText(i18n.t('submit'))).toBeTruthy();
  });

  it('shows a custom submit label when provided', async () => {
    await renderPalette(
      <LetterPalette
        letters={['A']}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={jest.fn()}
        submitLabel="Postavi"
      />,
    );
    expect(screen.getByText('Postavi')).toBeTruthy();
  });

  it('caps rendering at 5 tiles even if more letters are passed', async () => {
    await renderPalette(
      <LetterPalette
        letters={['A', 'B', 'C', 'D', 'E', 'F', 'G']}
        selectedIndex={null}
        onSelectTile={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('palette-tile-4')).toBeTruthy();
    expect(screen.queryByTestId('palette-tile-5')).toBeNull();
  });
});
