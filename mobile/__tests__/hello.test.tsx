import { render, screen } from '@testing-library/react-native';

import { Hello } from '@/components/hello';

describe('Hello (component render smoke test)', () => {
  it('renders the greeting', async () => {
    await render(<Hello name="Ukrstene" />);
    expect(screen.getByText('Hello, Ukrstene!')).toBeOnTheScreen();
  });
});
