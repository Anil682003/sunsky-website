import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { popularLinkLabel, popularGroupTitle } from './popularLabels';

describe('popular destination names in the visitor language', () => {
  it('translates the English names the dashboard stores, whatever their case', async () => {
    await i18n.changeLanguage('nl');
    const t = i18n.getFixedT('nl', 'common');
    expect(popularLinkLabel(t, 'Turkey All Inclusive')).toBe('Turkije All inclusive');
    expect(popularLinkLabel(t, ' cape  verde ')).toBe('Kaapverdië');
    expect(popularLinkLabel(t, 'Paris')).toBe('Parijs');
    expect(popularGroupTitle(t, 'Cities')).toBe('Steden');
  });

  it('keeps English on the English site and shows unknown names as typed', () => {
    const en = i18n.getFixedT('en', 'common');
    expect(popularLinkLabel(en, 'Turkey All Inclusive')).toBe('Turkey All Inclusive');
    const nl = i18n.getFixedT('nl', 'common');
    expect(popularLinkLabel(nl, 'Ibiza Party Week')).toBe('Ibiza Party Week');
    expect(popularGroupTitle(nl, 'Wintersport')).toBe('Wintersport');
  });
});
