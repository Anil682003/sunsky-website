import { describe, it, expect } from 'vitest';
import { themeVariables, applySiteTheme, decodeThemePreview, activeThemePreview, clearThemePreview } from './siteTheme';

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

  it('every homepage button and strip has its own colour, with a hover worked out from it', () => {
    const v = themeVariables({ marqueeBg: '#101010', trustBg: '#202020', popupBtnBg: '#303030', scriptText: '#404040' });
    expect(v['--marquee-bg']).toBe('#101010');
    expect(v['--trust-bg']).toBe('#202020');
    expect(v['--trust-tint']).toBe('#202020');
    expect(v['--popup-btn-bg']).toBe('#303030');
    expect(v['--popup-btn-hover']).toBe('color-mix(in srgb, #303030 88%, #000)');
    expect(v['--accent-script']).toBe('#404040');
  });

  it('a dashboard preview link shows only valid colours and ends on Close preview', () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeThemePreview(enc({ stripBg: '#ABCDEF', navText: 'red', 'bad key': '#000000' }))).toEqual({ stripBg: '#ABCDEF' });
    expect(decodeThemePreview('not base64 json')).toBeNull();
    expect(activeThemePreview('?themePreview=' + enc({ catBg: '#123456' }))).toEqual({ catBg: '#123456' });
    expect(activeThemePreview('')).toEqual({ catBg: '#123456' });
    clearThemePreview();
    expect(activeThemePreview('')).toBeNull();
  });
});
