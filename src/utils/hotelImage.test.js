import { describe, it, expect } from 'vitest';
import { hotelImage, hotelImageForWidth, hotelImageChain, VARIANT_WIDTH } from './hotelImage';

const CDN = 'https://photos.hotelbeds.com/giata/';
const PATH = '00/000022/000022a_hb_a_005.jpg';

describe('hotelImage', () => {
  it('adds the requested size folder', () => {
    expect(hotelImage(CDN + PATH, 'bigger')).toBe(`${CDN}bigger/${PATH}`);
    expect(hotelImage(CDN + PATH, 'xl')).toBe(`${CDN}xl/${PATH}`);
    expect(hotelImage(CDN + PATH, 'medium')).toBe(`${CDN}medium/${PATH}`);
  });

  it('"default" means the CDN default — no folder at all', () => {
    expect(hotelImage(CDN + PATH, 'default')).toBe(CDN + PATH);
    expect(hotelImage(CDN + PATH)).toBe(CDN + PATH);
  });

  it('REPLACES an existing variant rather than stacking them', () => {
    // The API may already hand us a sized URL; naive concatenation would produce
    // /giata/bigger/small/... which is a 404.
    expect(hotelImage(`${CDN}small/${PATH}`, 'bigger')).toBe(`${CDN}bigger/${PATH}`);
    expect(hotelImage(`${CDN}xl/${PATH}`, 'medium')).toBe(`${CDN}medium/${PATH}`);
    expect(hotelImage(`${CDN}bigger/${PATH}`, 'default')).toBe(CDN + PATH);
  });

  it('leaves a NON-Hotelbeds URL completely alone', () => {
    // Manually uploaded hotel photos live on OVH and have no size variants; rewriting
    // them would break the image.
    const ovh = 'https://sunsky-assets.s3.rbx.io.cloud.ovh.net/hotels/x.jpg';
    expect(hotelImage(ovh, 'bigger')).toBe(ovh);
    const unsplash = 'https://images.unsplash.com/photo-1566073771259?w=600&q=80';
    expect(hotelImage(unsplash, 'xl')).toBe(unsplash);
    expect(hotelImage('data:image/png;base64,AAA', 'xl')).toBe('data:image/png;base64,AAA');
  });

  it('passes through empty and non-string input unchanged', () => {
    expect(hotelImage(null, 'xl')).toBeNull();
    expect(hotelImage(undefined, 'xl')).toBeUndefined();
    expect(hotelImage('', 'xl')).toBe('');
    expect(hotelImage(42, 'xl')).toBe(42);
  });

  it('ignores an unknown size instead of forging a path', () => {
    expect(hotelImage(CDN + PATH, 'gigantic')).toBe(CDN + PATH);
    expect(hotelImage(CDN + PATH, '../../etc')).toBe(CDN + PATH);
  });

  it("keeps the path's cache-busting query string", () => {
    const q = `${PATH}?20240525104731?20250618185211`;
    expect(hotelImage(CDN + q, 'bigger')).toBe(`${CDN}bigger/${q}`);
  });

  it('matches the CDN host case-insensitively', () => {
    expect(hotelImage(`HTTPS://PHOTOS.HOTELBEDS.COM/giata/${PATH}`, 'bigger'))
      .toBe(`HTTPS://PHOTOS.HOTELBEDS.COM/giata/bigger/${PATH}`);
  });
});

describe('hotelImageForWidth', () => {
  const url = CDN + PATH;

  it('picks a variant at least as wide as the box needs', () => {
    // A 38px avatar on a 2x screen needs 76 real px — `small` (74) is NOT enough,
    // which is exactly the bug this replaced.
    expect(hotelImageForWidth(url, 38, 2)).toBe(`${CDN}medium/${PATH}`);
    expect(VARIANT_WIDTH.medium).toBeGreaterThanOrEqual(38 * 2);
  });

  it('steps up as the render box grows, skipping the unreliable xl', () => {
    expect(hotelImageForWidth(url, 100, 1)).toBe(`${CDN}medium/${PATH}`);    // 100
    expect(hotelImageForWidth(url, 300, 1)).toBe(url);                       // 300 → default 320
    expect(hotelImageForWidth(url, 360, 2)).toBe(`${CDN}bigger/${PATH}`);    // 720
    expect(hotelImageForWidth(url, 900, 2)).toBe(`${CDN}original/${PATH}`);  // 1800 → original, never xl
  });

  it('never returns the xl variant, which 403s for many images', () => {
    for (const [w, dpr] of [[900, 2], [1200, 2], [500, 3], [700, 2]]) {
      expect(hotelImageForWidth(url, w, dpr)).not.toContain('/xl/');
    }
  });

  it('accounts for device pixel ratio', () => {
    expect(hotelImageForWidth(url, 300, 1)).toBe(url);
    expect(hotelImageForWidth(url, 300, 2)).toBe(`${CDN}bigger/${PATH}`);
  });

  it('stops scaling past 3x, where extra pixels are invisible', () => {
    expect(hotelImageForWidth(url, 300, 4)).toBe(hotelImageForWidth(url, 300, 3));
  });

  it('still leaves non-Hotelbeds URLs alone', () => {
    const other = 'https://example.com/a.jpg';
    expect(hotelImageForWidth(other, 800, 2)).toBe(other);
  });
});

describe('hotelImageChain', () => {
  const url = CDN + PATH;

  it('lists the requested size, then progressively safer sizes down to default', () => {
    expect(hotelImageChain(url, 'original')).toEqual([
      `${CDN}original/${PATH}`, `${CDN}bigger/${PATH}`, url,
    ]);
    expect(hotelImageChain(url, 'bigger')).toEqual([`${CDN}bigger/${PATH}`, url]);
    expect(hotelImageChain(url, 'default')).toEqual([url]);
  });

  it('NEVER includes the xl variant in the fallback chain', () => {
    for (const size of ['original', 'bigger', 'default', 'medium', 'small']) {
      expect(hotelImageChain(url, size).some((u) => u.includes('/xl/'))).toBe(false);
    }
  });

  it('always ends at default, the size the CDN never fails to serve', () => {
    for (const size of ['original', 'bigger']) {
      expect(hotelImageChain(url, size).at(-1)).toBe(url);
    }
  });

  it('rebuilds from a URL that already carries a (broken) size', () => {
    // The card slider hands us whatever variant it last showed; the chain must strip it.
    expect(hotelImageChain(`${CDN}xl/${PATH}`, 'bigger')).toEqual([`${CDN}bigger/${PATH}`, url]);
  });

  it('a small-box request keeps its size, then falls to the reliable default', () => {
    expect(hotelImageChain(url, 'small')).toEqual([`${CDN}small/${PATH}`, url]);
    expect(hotelImageChain(url, 'medium')).toEqual([`${CDN}medium/${PATH}`, url]);
  });

  it('a non-Hotelbeds URL yields just itself — nothing to fall back through', () => {
    const ovh = 'https://sunsky-assets.s3.rbx.io.cloud.ovh.net/hotels/x.jpg';
    expect(hotelImageChain(ovh, 'original')).toEqual([ovh]);
  });

  it('empty input yields an empty chain', () => {
    expect(hotelImageChain(null, 'bigger')).toEqual([]);
    expect(hotelImageChain('', 'bigger')).toEqual([]);
    expect(hotelImageChain(undefined, 'bigger')).toEqual([]);
  });
});
