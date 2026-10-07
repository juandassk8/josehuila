import { describe, expect, it } from 'vitest';
import { documentText, ensureProductIds, photoUrl, productReadiness } from './model.js';
describe('Universo legacy compatibility and media', () => {
  it('keeps product IDs and unknown metadata while assigning an ID to legacy products', () => {
    const before = [{ id: 'stable', name: 'A', touchpoints: { angles: ['care'] } }, { name: 'B', promise: 'Original' }];
    expect(ensureProductIds(before, () => 'new')).toEqual([before[0], { ...before[1], id: 'new' }]);
    expect(before[1]).not.toHaveProperty('id');
    expect(() => ensureProductIds([{ id: 'a' }, { id: 'a' }])).toThrow('repetidos');
  });
  it('reads old text, imported raw text, and summary-only documents', () => {
    expect(documentText({ content: 'old' })).toBe('old');
    expect(documentText({ content: 'old', raw_content: 'actual' })).toBe('actual');
    expect(documentText({ extracted_summary: 'summary' })).toBe('summary');
  });
  it('never exposes a different company asset or an injected external URL', () => {
    const path = 'co/12345678-1234-1234-1234-123456789abc.jpg';
    expect(photoUrl({ path }, 'co')).toBe('/backend/storage/v1/object/company-assets/' + path);
    for (const value of [path, 'https://example.com/logo.png', '../co/logo.png', 'co/../../a', 'co/%2f.png']) expect(photoUrl({ path: value }, 'foreign')).toBeNull();
  });
  it('uses supplied context only for readiness, including numeric legacy prices', () => {
    expect(productReadiness({ name: 'A', what: 'B', avatar: 'C', price: 90 })).toEqual({ complete: 4, total: 5 });
  });
});
