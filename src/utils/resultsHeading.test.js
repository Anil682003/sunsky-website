import { describe, it, expect } from 'vitest';
import { resultsHeading, customHeading } from './resultsHeading';

const text = (h) => `${h.before}${h.em}${h.after}`;

describe('resultsHeading (Levent 28 Oct)', () => {
  it.each([
    [{ type: 'Stedentrips' }, 'Ontdek onze stedentrips', 'stedentrips'],
    [{ type: 'Zonvakanties' }, 'Ontdek onze zonvakanties', 'zonvakanties'],
    [{ type: 'Verre reizen' }, 'Ontdek onze verre reizen', 'verre reizen'],
    [{ type: 'Autovakanties' }, 'Ontdek onze autovakanties', 'autovakanties'],
    [{ place: 'Turkije' }, 'Ontdek onze vakanties in Turkije', 'Turkije'],
    [{ place: 'Spanje' }, 'Ontdek onze vakanties in Spanje', 'Spanje'],
    [{ place: 'Cyprus' }, 'Ontdek onze vakanties op Cyprus', 'Cyprus'],
    [{ place: 'Mallorca' }, 'Ontdek onze vakanties op Mallorca', 'Mallorca'],
    [{ place: 'Turkse Riviera' }, 'Ontdek onze vakanties aan de Turkse Riviera', 'Turkse Riviera'],
    [{ place: 'Hurghada' }, 'Ontdek onze vakanties in Hurghada', 'Hurghada'],
    [{ type: 'Stedentrips', place: 'Rome, Italië' }, 'Ontdek onze stedentrips naar Rome', 'Rome'],
    [{ type: 'Stedentrips', place: 'Barcelona' }, 'Ontdek onze stedentrips naar Barcelona', 'Barcelona'],
    [{ type: 'All Inclusive' }, 'Ontdek onze All Inclusive vakanties', 'All Inclusive'],
    [{ type: 'Last Minutes' }, 'Ontdek onze lastminutes', 'lastminutes'],
    [{ type: 'Winterzon' }, 'Ontdek onze winterzonvakanties', 'winterzonvakanties'],
    [{ type: 'Adults Only' }, 'Ontdek onze Adults Only vakanties', 'Adults Only'],
    [{}, 'Ontdek onze vakanties', 'vakanties'],
    [{ place: 'Malediven' }, 'Ontdek onze vakanties op de Malediven', 'Malediven'],
  ])('%j → %s', (ctx, want, em) => {
    const h = resultsHeading(ctx);
    expect(text(h)).toBe(want);
    expect(h.em).toBe(em);
  });

  it('English', () => {
    expect(text(resultsHeading({ place: 'Turkey', lang: 'en' }))).toBe('Discover our holidays in Turkey');
    expect(text(resultsHeading({ type: 'Stedentrips', place: 'Rome', lang: 'en' }))).toBe('Discover our city trips to Rome');
    expect(text(resultsHeading({ type: 'All Inclusive', lang: 'en' }))).toBe('Discover our All Inclusive holidays');
  });

  it('the admin override wins, verbatim', () => {
    const map = [{ kind: 'country', code: 'tr', nl: 'Zon in Turkije', en: 'Sun in Turkey' }, { kind: 'type', code: 'Stedentrips', nl: 'Steden!' }];
    expect(customHeading(map, { placeKeys: ['country:TR'], lang: 'nl' })).toBe('Zon in Turkije');
    expect(customHeading(map, { type: 'Stedentrips', lang: 'nl' })).toBe('Steden!');
    expect(customHeading(map, { type: 'Stedentrips', lang: 'en' })).toBe('');
    expect(text(resultsHeading({ place: 'Turkije', custom: 'Zon in Turkije' }))).toBe('Zon in Turkije');
  });
});
