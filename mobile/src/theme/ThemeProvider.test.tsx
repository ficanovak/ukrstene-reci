import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { lightColors } from './colors';
import { ThemeProvider, useTheme } from './ThemeProvider';

function Probe() {
  const { colors, mode, resolvedTheme } = useTheme();
  return (
    <>
      <Text testID="bg">{colors.background}</Text>
      <Text testID="mode">{mode}</Text>
      <Text testID="resolved">{resolvedTheme}</Text>
    </>
  );
}

describe('ThemeProvider / useTheme', () => {
  it('defaults to the light palette', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('bg')).toHaveTextContent(lightColors.background);
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  it('honors an explicit initial dark mode', async () => {
    await render(
      <ThemeProvider initialMode="dark">
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });
});
