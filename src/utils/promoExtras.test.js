import { extrasOf } from './promoExtras';

describe('extrasOf', () => {
  it('names each extra once, strings only', () => {
    expect(extrasOf([' Free Wifi ', 'Free Wifi', '', 3, null, 'Free parking'])).toEqual(['Free Wifi', 'Free parking']);
  });
  it('null when there is nothing to show', () => {
    expect(extrasOf(undefined)).toBeNull();
    expect(extrasOf([])).toBeNull();
    expect(extrasOf('Free Wifi')).toBeNull();
  });
  it('at most three', () => {
    expect(extrasOf(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
});
