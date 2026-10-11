import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index.js';

describe('shared barrel', () => {
  it('exports APP_NAME', () => {
    expect(APP_NAME).toBe('Nestly');
  });
});
