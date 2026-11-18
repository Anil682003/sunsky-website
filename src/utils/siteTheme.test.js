import { describe, it, expect } from 'vitest';
import { themeVariables, applySiteTheme } from './siteTheme';

describe('site theme from the CMS', () => {
  it('maps each chosen colour to its CSS variables and ignores the rest', () => {
    const v = themeVariables({ buttonFrom: '#112233', buttonTo: '#445566', stripBg: '#000000', navText: 'red', footerBg: '' });
    expect(v['--cta-grad']).toBe('linear-gradient(135deg, #112233, #445566)');
    expect(v['--strip-bg']).toBe('#000000');
    expect(v['--nav-ink']).toBeUndefined();
    expect(v['--footer-bg']).toBeUndefined();
  });

  it('an empty theme leaves the built-in colours', () => {
    expect(themeVariables({})).toEqual({});
    expect(themeVariables(null)).toEqual({});
  });

  it('clearing a colour removes what an earlier theme set', () => {
    const root = document.createElement('div');
    applySiteTheme({ stripBg: '#123456' }, root);
    expect(root.style.getPropertyValue('--strip-bg')).toBe('#123456');
    applySiteTheme({}, root);
    expect(root.style.getPropertyValue('--strip-bg')).toBe('');
  });
});
