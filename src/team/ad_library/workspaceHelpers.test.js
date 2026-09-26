import { describe, expect, it } from 'vitest';
import { share } from './workspaceHelpers.js';

describe('share', () => {
  it('returns the percentage of the total', () => {
    expect(share(1, 4)).toBe(25);
    expect(share(71, 71)).toBe(100);
  });
  it('never produces NaN or Infinity when the selection is empty', () => {
    expect(share(0, 0)).toBe(0);
    expect(share(3, 0)).toBe(0);
    expect(share(undefined, undefined)).toBe(0);
  });
  it('clamps inconsistent aggregates to the 0–100 range', () => {
    expect(share(5, 4)).toBe(100);
    expect(share(-1, 4)).toBe(0);
  });
});
