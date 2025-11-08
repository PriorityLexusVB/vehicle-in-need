import { describe, it, expect } from 'vitest';

describe('Buffer polyfill', () => {
  it('Buffer exists in test env', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((globalThis as any).Buffer).toBeDefined();
  });
});
