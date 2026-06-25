import { render, screen } from '@testing-library/react-native';

import { lightColors, ThemeProvider } from '@/theme';

import { Cell } from './Cell';

function renderCell(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

// RNTL 14 + React 19: render is async (concurrent). Tests await it so the
// `screen` global is populated before queries run.

/** Flattens a (possibly nested array) RN style prop into a single object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flattenStyle(s) }),
      {},
    );
  }
  return (style as Record<string, unknown>) ?? {};
}

describe('Cell', () => {
  it('shows the entry uppercased', async () => {
    await renderCell(
      <Cell row={0} col={0} entry="ž" check="correct" active={false} showCheck={false} size={50} />,
    );
    expect(screen.getByTestId('cell-text-0-0')).toHaveTextContent('Ž');
  });

  it('does NOT surface correctness color when showCheck is false', async () => {
    await renderCell(
      <Cell row={0} col={0} entry="X" check="wrong" active={false} showCheck={false} size={50} />,
    );
    const text = flattenStyle(screen.getByTestId('cell-text-0-0').props.style);
    expect(text.color).toBe(lightColors.text); // neutral, not coral
  });

  it('surfaces the wrong color when showCheck is true', async () => {
    await renderCell(
      <Cell row={0} col={0} entry="X" check="wrong" active={false} showCheck size={50} />,
    );
    const text = flattenStyle(screen.getByTestId('cell-text-0-0').props.style);
    expect(text.color).toBe(lightColors.wrong);
  });

  it('surfaces the correct color when showCheck is true', async () => {
    await renderCell(
      <Cell row={0} col={0} entry="R" check="correct" active={false} showCheck size={50} />,
    );
    const text = flattenStyle(screen.getByTestId('cell-text-0-0').props.style);
    expect(text.color).toBe(lightColors.correct);
  });

  it('applies the active highlight (thicker primary border)', async () => {
    await renderCell(
      <Cell row={0} col={0} entry={null} check="empty" active showCheck={false} size={50} />,
    );
    const cell = flattenStyle(screen.getByTestId('cell-0-0').props.style);
    expect(cell.borderWidth).toBe(2);
    expect(cell.borderColor).toBe(lightColors.primary);
  });
});
