import { describe, expect, it } from 'vitest';
import { FN_DOCS } from './docs';
import { FUNCTIONS } from './evaluator';

describe('formula function reference (admin guide)', () => {
  it('documents every engine function, and nothing else', () => {
    expect(Object.keys(FN_DOCS).sort()).toEqual(Object.keys(FUNCTIONS).sort());
  });
});
