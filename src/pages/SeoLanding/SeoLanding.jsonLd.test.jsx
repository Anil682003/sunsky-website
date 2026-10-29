// Structured data from CMS text cannot break out of its <script> tag (security review, 29 Oct 2026).
import { describe, it, expect } from 'vitest';
import { jsonLd } from './SeoLanding.jsx';

describe('jsonLd', () => {
  it('writes every "<" as \\u003c, so "</script>" in a CMS text cannot close the tag', () => {
    const out = jsonLd({ name: 'Antalya</script><script>alert(1)</script>' });
    expect(out).not.toMatch(/</);
    expect(out).not.toMatch(/<\/script/i);
    expect(out).toContain('\\u003c/script>');
  });

  it('is still the same JSON to a reader (Google parses it back unchanged)', () => {
    const data = { '@type': 'BreadcrumbList', itemListElement: [{ name: 'Turkije < Antalya', position: 1 }] };
    expect(JSON.parse(jsonLd(data))).toEqual(data);
  });
});
