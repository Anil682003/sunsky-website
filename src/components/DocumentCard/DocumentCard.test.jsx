import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentCard from './DocumentCard';

const PDF = 'https://sunsky-assets.s3.example/cms-documents/1789376998235-algemene-voorwaarden.pdf';

describe('DocumentCard', () => {
  it('shows the CMS label as the text the reader sees', () => {
    render(<DocumentCard url={PDF} name="algemene-voorwaarden.pdf" size={2_400_000} label="Download als PDF bestand" />);
    expect(screen.getByText('Download als PDF bestand')).toBeInTheDocument();
    // The filename and size stay visible underneath, so nothing is hidden.
    expect(screen.getByText(/algemene-voorwaarden\.pdf · 2\.3 MB/)).toBeInTheDocument();
  });

  it('falls back to the filename when no label is set', () => {
    render(<DocumentCard url={PDF} name="algemene-voorwaarden.pdf" size={1024} />);
    expect(screen.getByText('algemene-voorwaarden.pdf')).toBeInTheDocument();
    expect(screen.getByText(/^PDF · 1 KB$/)).toBeInTheDocument();
  });

  /* Uploads are stored as "<timestamp>-<original name>", which is not a name to
     show anybody. */
  it('recovers a readable name from the URL when the CMS recorded none', () => {
    render(<DocumentCard url={PDF} />);
    expect(screen.getByText('algemene-voorwaarden.pdf')).toBeInTheDocument();
  });

  /* Browsers fetch a framed PDF eagerly, so a page with several attachments
     would pull megabytes for documents nobody asked to see. */
  it('does not load the PDF until the reader asks to view it', async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentCard url={PDF} label="Voorwaarden" />);
    expect(container.querySelector('iframe')).toBeNull();

    await user.click(screen.getByRole('button', { name: /view/i }));
    expect(container.querySelector('iframe')).toHaveAttribute('src', PDF);

    await user.click(screen.getByRole('button', { name: /hide/i }));
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('always offers the new-tab route, which works where a frame does not', () => {
    render(<DocumentCard url={PDF} label="Voorwaarden" />);
    const open = screen.getByRole('link', { name: /open/i });
    expect(open).toHaveAttribute('href', PDF);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('renders nothing when no document is attached', () => {
    const { container } = render(<DocumentCard url="" label="ignored" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the panel state to assistive technology', async () => {
    const user = userEvent.setup();
    render(<DocumentCard url={PDF} label="Voorwaarden" />);
    const toggle = screen.getByRole('button', { name: /view/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: /hide/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
