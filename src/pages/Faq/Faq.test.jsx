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

    expect(await screen.findByRole('heading', { name: 'Veelgestelde vragen' })).toBeInTheDocument();
    // Every shipped question is on the page, under its stage.
    await waitFor(() =>
      expect(screen.getAllByRole('region', { hidden: true }).length).toBeGreaterThanOrEqual(FALLBACK_FAQS.length)
    );
    expect(screen.getByRole('heading', { name: 'Voor je boekt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Na je reis' })).toBeInTheDocument();
  });

  /* The live CMS sat for months holding a single row reading "Test 1". Letting
     that replace the shipped set would have emptied the help centre. */
  it('ignores a CMS table that is still being set up', async () => {
    fetchAllFaqs.mockResolvedValue([cmsRow(1, 'What are the custom travel options ?', 'Test 1', 'Payment')]);
    fetchFaqCategories.mockResolvedValue([{ id: 1, title: 'Payment', sortOrder: 0, status: 'ACTIVE' }]);
    draw();

    expect(await screen.findByRole('heading', { name: 'Voor je boekt' })).toBeInTheDocument();
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
    expect(screen.queryByText('Hoe boek ik?')).not.toBeInTheDocument();
  });

  it('searches answers as well as questions', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Voor je boekt' });

    await user.type(screen.getByLabelText(/zoek in de veelgestelde vragen/i), 'PCI-DSS');

    // "How do I pay, and is it secure?" only mentions PCI-DSS in its answer.
    await waitFor(() => expect(screen.getByText('Hoe betaal ik, en is dat veilig?')).toBeInTheDocument());
    expect(screen.queryByText('Is bagage inbegrepen?')).not.toBeInTheDocument();
    // The site is Dutch, so the live result count is too.
    expect(screen.getByRole('status')).toHaveTextContent('1 antwoord');
  });

  it('keeps one answer open at a time', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Voor je boekt' });

    await user.click(await row('Hoe boek ik?'));
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);

    await user.click(await row('Wat is een dynamische pakketreis?'));
    const open = screen.getAllByRole('button', { expanded: true });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent('Wat is een dynamische pakketreis?');
  });

  it('filters to a stage and highlights the card that is on', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Voor je boekt' });

    const card = screen.getByRole('button', { name: /Tijdens je reis/ });
    await user.click(card);

    await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('heading', { name: 'Voor je boekt' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tijdens je reis' })).toBeInTheDocument();
  });

  /* A search that matches nothing has to offer a way out, or the reader is
     looking at an empty page with a filter they may not realise is applied. */
  it('offers a way back when nothing matches', async () => {
    const user = userEvent.setup();
    draw();
    await screen.findByRole('heading', { name: 'Voor je boekt' });

    await user.type(screen.getByLabelText(/zoek in de veelgestelde vragen/i), 'zzzqqq');

    const reset = await screen.findByRole('button', { name: 'Toon alle vragen' });
    await user.click(reset);

    expect(await screen.findByRole('heading', { name: 'Voor je boekt' })).toBeInTheDocument();
  });

  it('opens the answer a shared /faq#faq-<id> address points at', async () => {
    window.location.hash = '#faq-f-dep-change';
    draw();

    const open = await screen.findAllByRole('button', { expanded: true });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveTextContent('Kan ik mijn boeking wijzigen?');
  });

  it('shows the contact details and the emergency line', async () => {
    draw();
    const side = await screen.findByRole('complementary', { name: 'Meer hulp' });
    expect(within(side).getByText('info@sunsky.be')).toBeInTheDocument();
    expect(within(side).getByText('+32 11 57 44 27')).toBeInTheDocument();
    expect(within(side).getByText('+32 497 54 38 16')).toBeInTheDocument();
  });
});


/* SUNSKY renamed their categories in the dashboard and wrote their own Dutch
   questions. One of those names, "Na de reis - Boeken, reisaanbod & prijzen",
   matches the journey stage the site ships, and the site went on labelling that
   card with its own English title instead. Their questions appeared under a name
   they had not chosen, in a language they had moved away from. */
describe('a category renamed in the dashboard', () => {
  const cmsRowIn = (id, question, categoryId, categoryTitle) => ({
    id,
    faqCategoryId: categoryId,
    sortOrder: id,
    status: 'ACTIVE',
    isFeatured: false,
    question,
    answer: 'Antwoord.',
    faqCategory: { id: categoryId, sortOrder: 0, status: 'ACTIVE', title: categoryTitle },
  });

  it('keeps the name the dashboard gave it, even when it maps onto a shipped stage', async () => {
    fetchAllFaqs.mockResolvedValue([
      cmsRowIn(1, 'Vraag een', 15, 'Na de reis - Boeken, reisaanbod & prijzen'),
      cmsRowIn(2, 'Vraag twee', 15, 'Na de reis - Boeken, reisaanbod & prijzen'),
      cmsRowIn(3, 'Vraag drie', 10, 'Voor de reis'),
      cmsRowIn(4, 'Vraag vier', 10, 'Voor de reis'),
    ]);
    fetchFaqCategories.mockResolvedValue([
      { id: 15, title: 'Na de reis - Boeken, reisaanbod & prijzen', sortOrder: 0, status: 'ACTIVE' },
      { id: 10, title: 'Voor de reis', sortOrder: 0, status: 'ACTIVE' },
    ]);
    draw();

    expect(
      await screen.findByRole('heading', { name: 'Na de reis - Boeken, reisaanbod & prijzen' })
    ).toBeInTheDocument();
    // The shipped title must not be substituted for theirs.
    expect(screen.queryByRole('heading', { name: 'Na je reis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'After your trip' })).not.toBeInTheDocument();
  });

  it('uses the dashboard description under the card too', async () => {
    fetchAllFaqs.mockResolvedValue([
      cmsRowIn(1, 'Vraag een', 13, 'Na de reis'),
      cmsRowIn(2, 'Vraag twee', 13, 'Na de reis'),
      cmsRowIn(3, 'Vraag drie', 13, 'Na de reis'),
      cmsRowIn(4, 'Vraag vier', 13, 'Na de reis'),
    ]);
    fetchFaqCategories.mockResolvedValue([
      { id: 13, title: 'Na de reis', description: 'Wat we doen als je thuis bent.', sortOrder: 0, status: 'ACTIVE' },
    ]);
    draw();

    // It shows in both places the card is described: the stage card and the
    // heading above that group's questions.
    const shown = await screen.findAllByText('Wat we doen als je thuis bent.');
    expect(shown.length).toBeGreaterThan(0);
  });
});

/* ── Subcategories ──────────────────────────────────────────────────────────
   SUNSKY filed 58 of their 72 questions under one category and then asked for
   subcategories to break it up. A subcategory is NOT a card of its own: it is a
   filter inside the card of the category it belongs to, because promoting it
   would rebuild the flat list it was meant to replace.

   A subcategory with no questions in it draws nothing, which is correct and is
   also the first thing that looks broken: the dashboard shows the subcategory,
   the website shows no sign of it, and the obvious conclusion is that the site
   cannot do subcategories. It can. It needs a question filed under one.        */
describe('subcategories', () => {
  const PARENT = { id: 10, title: 'Voor de reis', sortOrder: 0, status: 'ACTIVE' };
  const SUB = { id: 22, title: 'Boeken & prijzen', parentId: 10, sortOrder: 1, status: 'ACTIVE' };

  /** A question filed directly against the parent category. */
  const inParent = (id, question) => ({
    ...cmsRow(id, question, `Antwoord ${id}.`, PARENT.title),
    faqCategoryId: PARENT.id,
    faqCategory: PARENT,
  });

  /** A question filed against the subcategory. */
  const inSub = (id, question) => ({
    ...cmsRow(id, question, `Antwoord ${id}.`, SUB.title),
    faqCategoryId: SUB.id,
    faqCategory: SUB,
  });

  const withSubcategory = () => {
    fetchFaqCategories.mockResolvedValue([PARENT, SUB]);
    fetchAllFaqs.mockResolvedValue([
      inParent(1, 'Welke documenten heb ik nodig?'),
      inParent(2, 'Hoe laat moet ik op de luchthaven zijn?'),
      inSub(3, 'Wanneer moet ik het saldo betalen?'),
      inSub(4, 'Kan ik in termijnen betalen?'),
    ]);
  };

  it('keeps a subcategory inside its parent instead of making it a card', async () => {
    withSubcategory();
    draw();

    // The parent is the card. The subcategory is not one.
    expect(await screen.findByRole('heading', { name: PARENT.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: SUB.title })).not.toBeInTheDocument();
  });

  it('offers the subcategory as a filter, counting only its own questions', async () => {
    withSubcategory();
    draw();

    const bar = await screen.findByRole('group', { name: `Filter ${PARENT.title}` });
    expect(within(bar).getByRole('button', { name: /Boeken & prijzen/ })).toHaveTextContent('(2)');
    // …alongside a way back to the whole category.
    expect(within(bar).getByRole('button', { name: /^Alle/ })).toHaveTextContent('(4)');
  });

  it('narrows the card to the subcategory, and back again', async () => {
    withSubcategory();
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: /Boeken & prijzen/ }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Welke documenten heb ik nodig?' })).not.toBeInTheDocument()
    );
    expect(await row('Wanneer moet ik het saldo betalen?')).toBeInTheDocument();

    // Clicking the open filter again clears it, so the full card is one click away.
    await user.click(screen.getByRole('button', { name: /Boeken & prijzen/ }));
    expect(await row('Welke documenten heb ik nodig?')).toBeInTheDocument();
  });

  it('draws no filter bar for a subcategory nobody has filed a question under', async () => {
    // Exactly the state SUNSKY reported as broken: the subcategory exists in the
    // dashboard and every question is still on the parent.
    fetchFaqCategories.mockResolvedValue([PARENT, SUB]);
    fetchAllFaqs.mockResolvedValue([
      inParent(1, 'Welke documenten heb ik nodig?'),
      inParent(2, 'Hoe laat moet ik op de luchthaven zijn?'),
      inParent(3, 'Wanneer moet ik het saldo betalen?'),
      inParent(4, 'Kan ik in termijnen betalen?'),
    ]);
    draw();

    expect(await screen.findByRole('heading', { name: PARENT.title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Boeken & prijzen/ })).not.toBeInTheDocument();
    // An empty filter bar would be worse than none: "Alle (4)" and nothing to
    // narrow to is a control that does nothing.
    expect(screen.queryByRole('group', { name: `Filter ${PARENT.title}` })).not.toBeInTheDocument();
  });
});
