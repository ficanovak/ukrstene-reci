/**
 * Unit tests for a single Advanced-mode letter tile (Task 6.2).
 *
 * A tile is a pressable amber square showing one grapheme (a digraph like 'NJ'
 * occupies one tile). It encodes its `selected` state via `accessibilityState`
 * so the screen/tests can assert highlight without depending on styles.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme';

import { LetterTile } from './LetterTile';

function renderTile(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('LetterTile', () => {
  it('renders its grapheme', async () => {
    await renderTile(<LetterTile grapheme="Š" selected={false} onPress={jest.fn()} />);
    expect(screen.getByText('Š')).toBeTruthy();
  });

  it('renders a digraph in a single tile', async () => {
    await renderTile(<LetterTile grapheme="NJ" selected={false} onPress={jest.fn()} />);
    expect(screen.getByText('NJ')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderTile(
      <LetterTile testID="tile" grapheme="A" selected={false} onPress={onPress} />,
    );
    fireEvent.press(screen.getByTestId('tile'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects the selected state via accessibilityState', async () => {
    await renderTile(
      <LetterTile testID="tile" grapheme="A" selected onPress={jest.fn()} />,
    );
    expect(screen.getByTestId('tile').props.accessibilityState?.selected).toBe(true);
  });
});
