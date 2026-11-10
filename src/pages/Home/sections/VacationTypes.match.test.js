import { describe, it, expect } from 'vitest';
import { criteriaUrl } from './VacationTypes';
import { facetsParams } from '../../../utils/facetsParams';

const q = (url) => new URL(url, 'https://x').searchParams;
const waterpark = { filterKey: 'activities', value: '73:620', label: 'Waterpark' };
const slides = { filterKey: 'activities', value: '73:610', label: 'WaterSlides' };

describe('Theme Holiday card link', () => {
  it('Match all (default) keeps the existing params unchanged', () => {
    const p = q(criteriaUrl([waterpark, slides], 'Aquapark'));
    expect(p.get('activities')).toBe('73:620,73:610');
    expect(p.get('any')).toBeNull();
    expect(p.get('excludeAdultsOnly')).toBeNull();
  });

  it('Match any puts the content criteria in one any group; board stays required', () => {
    const p = q(criteriaUrl(
      [waterpark, slides, { filterKey: 'segments', value: 81, label: 'Family hotels' }, { filterKey: 'boards', value: 'AI', label: 'All Inclusive' }],
      'Aquapark', { match: 'any', excludeAdultsOnly: true },
    ));
    expect(p.get('any')).toBe('activities:73:620;activities:73:610;segments:81');
    expect(p.get('activities')).toBeNull();
    expect(p.get('boards')).toBe('AI');
    expect(p.get('excludeAdultsOnly')).toBe('1');
  });

  it('a segment in Match all is a plain segments param', () => {
    expect(q(criteriaUrl([{ filterKey: 'segments', value: 119, label: 'Luxury collection' }], 'Luxury')).get('segments')).toBe('119');
  });

  it('the facets request carries segments, any and the exclusion', () => {
    const p = facetsParams({ destinations: ['AYT'] }, { segments: [81], any: 'kids:340;segments:81', excludeAdultsOnly: true });
    expect(p).toMatchObject({ segments: '81', any: 'kids:340;segments:81', excludeAdultsOnly: '1' });
    expect(facetsParams({ destinations: ['AYT'] }, {})).not.toHaveProperty('any');
  });
});
