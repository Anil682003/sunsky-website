import { describe, it, expect } from 'vitest';
import { sectionDocuments } from './sectionDocuments';

describe('sectionDocuments', () => {
  it('reads the list the admin saves since 25 Nov 2026, in order', () => {
    const docs = sectionDocuments({ documents: [{ url: 'a.pdf', label: 'Voorwaarden' }, { url: 'b.pdf' }, { url: 'c.pdf' }] });
    expect(docs.map((d) => d.url)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
  });
  it('reads a page saved before as a list of one', () => {
    expect(sectionDocuments({ documentUrl: 'old.pdf', documentName: 'old.pdf', documentSize: 10, documentLabel: 'L' }))
      .toEqual([{ url: 'old.pdf', name: 'old.pdf', size: 10, label: 'L' }]);
  });
  it('nothing attached, or entries without an address: no cards', () => {
    expect(sectionDocuments({})).toEqual([]);
    expect(sectionDocuments(null)).toEqual([]);
    expect(sectionDocuments({ documents: [{ url: '' }, null] })).toEqual([]);
  });
});
