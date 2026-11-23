import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SectionTabs, { sectionInView } from './SectionTabs';

describe('hotel page sections: one continuous page, the tab bar only points', () => {
  it('the section being read is the last one whose top reached the reading line', () => {
    expect(sectionInView([300, 1500, 3000], 200)).toBe(0);
    expect(sectionInView([-900, 150, 1600], 200)).toBe(1);
    expect(sectionInView([-3000, -1500, 190], 200)).toBe(2);
    // Scrolling back up hands the highlight back.
    expect(sectionInView([-100, 600, 2100], 200)).toBe(0);
  });

  it('at the very end of the page a short last section is the one being read', () => {
    expect(sectionInView([-3000, -200, 450], 200, true)).toBe(2);
    expect(sectionInView([-3000, -200, 450], 200, false)).toBe(1);
  });

  it('a click glides to the section under the bar and lights the tab at once', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const info = document.createElement('div');
    info.getBoundingClientRect = () => ({ top: 1800 });
    const refs = { current: { Prices: document.createElement('div'), Information: info, Facilities: document.createElement('div') } };
    render(<SectionTabs tabs={['Prices', 'Information', 'Facilities']} sectionRefs={refs} renderLabel={(t) => t} />);
    fireEvent.click(screen.getByRole('button', { name: 'Information' }));
    expect(screen.getByRole('button', { name: 'Information' })).toHaveClass('act');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0].top).toBeGreaterThan(1700);
  });
});
