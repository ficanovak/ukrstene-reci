import { sum } from '@/utils/sum';

describe('sum (pure-function smoke test)', () => {
  it('adds two numbers', () => {
    expect(sum(2, 3)).toBe(5);
  });

  it('handles negatives', () => {
    expect(sum(-4, 1)).toBe(-3);
  });
});
