import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/* The help centre reads its questions from the CMS and falls back to the set
   shipped in faqContent.js. The two things that must never happen are a page
   that answers nothing because the CMS is half-configured, and a filter that
   leaves the reader stranded with no way back to the full list. */

const fetchAllFaqs = vi.fn();
const fetchFaqCategories = vi.fn();

vi.mock('../../api', () => ({
  fetchAllFaqs: (...a) => fetchAllFaqs(...a),
  fetchFaqCategories: (...a) => fetchFaqCategories(...a),
}));

const { default: Faq } = await import('./Faq');
const { FALLBACK_FAQS } = await import('./faqContent');

/** One CMS row in the shape /cms/faqs returns. */
const cmsRow = (id, question, answer, categoryTitle, extra = {}) => ({
  id,
  faqCategoryId: 1,
  sortOrder: id,
  status: 'ACTIVE',
  isFeatured: false,
  question,
  answer,
  faqCategory: { id: 1, sortOrder: 0, status: 'ACTIVE', title: categoryTitle },
  ...extra,
});

const draw = () => render(<Faq />, { wrapper: MemoryRouter });

/* A featured question appears twice on purpose: once as a "Most asked" shortcut
   and once as the accordion row itself. Only the row toggles, so tests that open
   an answer have to say which of the two they mean. */
const row = async (name) =>
  (await screen.findAllByRole('button', { name })).find((b) => b.hasAttribute('aria-expanded'));

beforeEach(() => {
  vi.clearAllMocks();
  fetchAllFaqs.mockResolvedValue([]);
  fetchFaqCategories.mockResolvedValue([]);
  window.location.hash = '';
});

describe('FAQ page', () => {
  it('answers questions even when the CMS is unreachable', async () => {
    fetchAllFaqs.mockResolvedValue([]);
    fetchFaqCategories.mockResolvedValue([]);
    draw();

    expect(await screen.findByRole('heading', { name: 'Frequently Asked Questions' })).toBeInTheDocument();
    // Every shipped question is on the page, under its stage.
    await waitFor(() =>
      expect(screen.getAllByRole('region', { hidden: true }).length).toBeGreaterThanOrEqual(FALLBACK_FAQS.length)
    );
    expect(screen.getByRole('heading', { name: 'Before you book' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'After your trip' })).toBeInTheDocument();
  });

  /* The live CMS sat for months holding a single row reading "Test 1". Letting
     that replace the shipped set would have emptied the help centre. */
  it('ignores a CMS table that is still being set up', async () => {
    fetchAllFaqs.mockResolvedValue([cmsRow(1, 'What are the custom travel options ?', 'Test 1', 'Payment')]);
    fetchFaqCategories.mockResolvedValue([{ id: 1, title: 'Payment', sortOrder: 0, status: 'ACTIVE' }]);
    draw();

    expect(await screen.findByRole('heading', { name: 'Before you book' })).toBeInTheDocument();
    await waitFor(() => expect(fetchAllFaqs).toHaveBeenCalled());
    expect(screen.queryByText('What are the custom travel options ?')).not.toBeInTheDocument();
  });

  it('lets a stocked CMS replace the shipped questions', async () => {
    fetchAllFaqs.mockResolvedValue([
      cmsRow(1, 'Do you sell car hire?', 'Yes, at selected destinations.', 'Before you book', { isFeatured: true }),
      cmsRow(2, 'Can I pay in instalments?', 'Ask our team.', 'Before you book'),
      cmsRow(3, 'Where do I check in?', 'On the airline site.', 'After booking'),
      cmsRow(4, 'Who do I call abroad?', 'The emergency line.', 'During your trip'),
    ]);
    fetchFaqCategories.mockResolvedValue([]);
    draw();

    expect(await row('Do you sell car hire?')).toBeDefined();
    expect(await screen.findByText('Where do I check in?')).toBeInTheDocument();
    // A question retired in the dashboard must disappear from the site.
    expect(screen.queryByText('How do I book?')).not.toBeInTheDocument();
  });

  it('searches answers as well as questions', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Before you book' });

    await user.type(screen.getByLabelText(/search the frequently asked questions/i), 'PCI-DSS');

    // "How do I pay, and is it secure?" only mentions PCI-DSS in its answer.
    await waitFor(() => expect(screen.getByText('How do I pay, and is it secure?')).toBeInTheDocument());
    expect(screen.queryByText('Is baggage included?')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 answer');
  });

  it('keeps one answer open at a time', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Before you book' });

    await user.click(await row('How do I book?'));
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);

    await user.click(await row('What is a dynamic package?'));
    const open = screen.getAllByRole('button', { expanded: true });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent('What is a dynamic package?');
  });

  it('filters to a stage and highlights the card that is on', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Before you book' });

    const card = screen.getByRole('button', { name: /During your trip/ });
    await user.click(card);

    await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('heading', { name: 'Before you book' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'During your trip' })).toBeInTheDocument();
  });

  /* A search that matches nothing has to offer a way out, or the reader is
     looking at an empty page with a filter they may not realise is applied. */
  it('offers a way back when nothing matches', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Before you book' });

    await user.type(screen.getByLabelText(/search the frequently asked questions/i), 'zzzqqq');

    const reset = await screen.findByRole('button', { name: 'Show all questions' });
    await user.click(reset);

    expect(await screen.findByRole('heading', { name: 'Before you book' })).toBeInTheDocument();
  });

  it('opens the answer a shared /faq#faq-<id> address points at', async () => {
    window.location.hash = '#faq-f-dep-change';
    draw();

    const open = await screen.findAllByRole('button', { expanded: true });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent('Can I change my booking?');
  });

  it('shows the contact details and the emergency line', async () => {
    draw();
    const side = await screen.findByRole('complementary', { name: 'More help' });
    expect(within(side).getByText('info@sunsky.be')).toBeInTheDocument();
    expect(within(side).getByText('+32 11 57 44 27')).toBeInTheDocument();
    expect(within(side).getByText('+32 497 54 38 16')).toBeInTheDocument();
  });
});

