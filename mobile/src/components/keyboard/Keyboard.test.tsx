import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme';

import { Keyboard } from './Keyboard';
import { getLayout, keysOf } from './layouts';

function renderKeyboard(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Keyboard', () => {
  it('emits the digraph grapheme when the NJ key is pressed', async () => {
    const onKeyPress = jest.fn();
    await renderKeyboard(
      <Keyboard language="sr" script="lat" onKeyPress={onKeyPress} onBackspace={jest.fn()} />,
    );
    fireEvent.press(screen.getByTestId('key-NJ'));
    expect(onKeyPress).toHaveBeenCalledTimes(1);
    expect(onKeyPress).toHaveBeenCalledWith('NJ');
  });

  it('emits a single-letter grapheme when a normal key is pressed', async () => {
    const onKeyPress = jest.fn();
    await renderKeyboard(
      <Keyboard language="sr" script="lat" onKeyPress={onKeyPress} onBackspace={jest.fn()} />,
    );
    fireEvent.press(screen.getByTestId('key-Š'));
    expect(onKeyPress).toHaveBeenCalledWith('Š');
  });

  it('calls onBackspace when the backspace key is pressed (not onKeyPress)', async () => {
    const onKeyPress = jest.fn();
    const onBackspace = jest.fn();
    await renderKeyboard(
      <Keyboard language="sr" script="lat" onKeyPress={onKeyPress} onBackspace={onBackspace} />,
    );
    fireEvent.press(screen.getByTestId('key-backspace'));
    expect(onBackspace).toHaveBeenCalledTimes(1);
    expect(onKeyPress).not.toHaveBeenCalled();
  });

  it('renders one key per grapheme in the resolved layout', async () => {
    await renderKeyboard(
      <Keyboard language="mk" script="cyr" onKeyPress={jest.fn()} onBackspace={jest.fn()} />,
    );
    const keys = keysOf(getLayout('mk', 'cyr'));
    for (const g of keys) {
      expect(screen.getByTestId(`key-${g}`)).toBeTruthy();
    }
    // plus the backspace control key
    expect(screen.getByTestId('key-backspace')).toBeTruthy();
  });
});
