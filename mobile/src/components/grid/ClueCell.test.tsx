import { render, screen, fireEvent } from '@testing-library/react-native';

import type { Clue } from '@/game/gridData.types';
import { ThemeProvider } from '@/theme';

import { ClueCell } from './ClueCell';

function renderClue(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ClueCell', () => {
  const textClue: Clue = { type: 'text', text: 'A river in Egypt' };

  it('renders text + right arrow for across', async () => {
    await renderClue(<ClueCell row={0} col={0} clue={textClue} dir="across" size={60} />);
    expect(screen.getByTestId('clue-text-0-0')).toHaveTextContent('A river in Egypt');
    expect(screen.getByTestId('clue-arrow-0-0')).toHaveTextContent('▶');
  });

  it('renders down arrow for down', async () => {
    await renderClue(<ClueCell row={1} col={0} clue={textClue} dir="down" size={60} />);
    expect(screen.getByTestId('clue-arrow-1-0')).toHaveTextContent('▼');
  });

  it('renders a placeholder box for an image clue with no imageRef', async () => {
    const imgClue: Clue = { type: 'image' };
    await renderClue(<ClueCell row={2} col={3} clue={imgClue} dir="across" size={60} />);
    expect(screen.getByTestId('clue-image-placeholder-2-3')).toBeTruthy();
  });

  it('renders an expo-image for an image clue with an imageRef', async () => {
    const imgClue: Clue = { type: 'image', imageRef: 'https://example.com/x.png' };
    await renderClue(<ClueCell row={0} col={0} clue={imgClue} dir="down" size={60} />);
    expect(screen.getByTestId('clue-image-0-0')).toBeTruthy();
  });

  it('fires onPress with coordinates', async () => {
    const onPress = jest.fn();
    await renderClue(
      <ClueCell row={0} col={0} clue={textClue} dir="across" size={60} onPress={onPress} />,
    );
    fireEvent.press(screen.getByTestId('clue-0-0'));
    expect(onPress).toHaveBeenCalledWith(0, 0);
  });
});
