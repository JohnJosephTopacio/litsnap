// Acceptance criteria from docs/features/lookup-modal.md, for the component against the mock
// client. jsdom has no showModal(), so test-setup.ts stands in; Esc, the backdrop and the focus
// trap need a real browser and are in e2e/lookup-modal.spec.ts.
import type { LookupKind, LookupResult } from '@litsnap/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LookupClient } from './client';
import { LookupModal, type LookupRequest } from './LookupModal';
import { createMockLookupClient, MOCK_TERMS } from './mockClient';

const request = (kind: LookupKind, term: string = MOCK_TERMS.found): LookupRequest => ({
  kind,
  term,
  display: 'Hipped-Roof',
  sentence: { before: 'The house had a ', match: 'Hipped-Roof', after: ' and two chimneys.' },
});

function renderModal({
  kind = 'definition' as LookupKind,
  term = MOCK_TERMS.found as string,
  client = createMockLookupClient({ delayMs: 0 }) as LookupClient | undefined,
  size = 'm' as const,
} = {}) {
  const onClose = vi.fn();
  const onSizeChange = vi.fn();
  const view = render(
    <LookupModal
      request={request(kind, term)}
      client={client}
      size={size}
      onSizeChange={onSizeChange}
      onClose={onClose}
    />,
  );
  return { onClose, onSizeChange, ...view };
}

const dialog = () => screen.getByRole('dialog', { name: 'Hipped-Roof' });
const section = (name: string) => screen.getByRole('region', { name });

/** A client whose lookups resolve or reject only when the test says so. */
function controlledClient() {
  const calls: {
    signal: AbortSignal;
    resolve: (result: LookupResult) => void;
    reject: (error: Error) => void;
  }[] = [];
  const client: LookupClient = {
    lookup: (_term, _kind, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  };
  return { client, calls };
}

describe('LookupModal', () => {
  describe('MODAL-1/2: opening, header', () => {
    it('opens as a modal dialog named by the display term', () => {
      renderModal();
      expect(dialog()).toHaveAttribute('open');
      expect(screen.getByRole('heading', { level: 2, name: 'Hipped-Roof' })).toBeInTheDocument();
    });

    it('shows the source sentence with the selected words marked, as text', () => {
      const { container } = renderModal();
      expect(screen.getByText(/The house had a/).textContent).toBe(
        'The house had a Hipped-Roof and two chimneys.',
      );
      expect(container.querySelector('mark')?.textContent).toBe('Hipped-Roof');
    });
  });

  describe('MODAL-3: sections for the chosen kind', () => {
    it.each([
      ['definition', ['Definition']],
      ['image', ['Images']],
      ['both', ['Definition', 'Images']],
    ] as const)('%s', async (kind, names) => {
      renderModal({ kind });
      await screen.findAllByText(/No good image found|A roof/);
      for (const name of ['Definition', 'Images']) {
        if ((names as readonly string[]).includes(name)) expect(section(name)).toBeInTheDocument();
        else expect(screen.queryByRole('region', { name })).toBeNull();
      }
    });
  });

  describe('MODAL-4: Search Google ↗', () => {
    it('links to a Google search for the lookup term, in a new tab', () => {
      renderModal({ kind: 'image', term: 'hipped roof' });
      const link = screen.getByRole('link', { name: 'Search Google ↗' });
      expect(link).toHaveAttribute('href', 'https://www.google.com/search?q=hipped+roof&udm=2');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('MODAL-5: production, until M3', () => {
    it('says lookups are coming soon instead of showing sections', () => {
      renderModal({ kind: 'both', client: undefined });
      expect(screen.getByText('Definitions and images are coming soon.')).toBeInTheDocument();
      expect(screen.queryByRole('region')).toBeNull();
      expect(screen.getByRole('link', { name: 'Search Google ↗' })).toBeInTheDocument();
    });
  });

  describe('MODAL-6: loading', () => {
    it('shows Loading… with aria-busy until the result arrives', async () => {
      const { client, calls } = controlledClient();
      renderModal({ kind: 'both', client });
      for (const name of ['Definition', 'Images']) {
        expect(section(name)).toHaveAttribute('aria-busy', 'true');
        expect(within(section(name)).getByText('Loading…')).toBeInTheDocument();
      }
      await act(async () => {
        calls[0]?.resolve({
          term: 'x',
          definition: { status: 'not-found' },
          images: { status: 'not-found' },
        });
        await Promise.resolve();
      });
      expect(section('Definition')).toHaveAttribute('aria-busy', 'false');
      expect(screen.queryByText('Loading…')).toBeNull();
    });
  });

  describe('MODAL-7: definition found', () => {
    it('lists parts of speech with numbered senses, and the attribution', async () => {
      renderModal();
      const definition = section('Definition');
      expect(await within(definition).findByRole('heading', { name: 'noun' })).toBeInTheDocument();
      expect(within(definition).getAllByRole('list')[0]?.tagName).toBe('OL');
      expect(within(definition).getAllByRole('listitem').length).toBeGreaterThan(0);
      const source = within(definition).getByRole('link', { name: /sample/i });
      expect(source).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
      expect(source.closest('p')?.textContent).toMatch(/^From /);
      expect(within(definition).queryByText(/Summary from Wikipedia/)).toBeNull();
    });

    it('labels a Wikipedia summary', async () => {
      renderModal({ term: MOCK_TERMS.wikipedia });
      expect(
        await screen.findByText('No dictionary entry. Summary from Wikipedia.'),
      ).toBeInTheDocument();
    });
  });

  describe('MODAL-8/9: nothing found', () => {
    it('says so in each section', async () => {
      renderModal({ kind: 'both', term: 'zzyzx' });
      expect(
        await within(section('Definition')).findByText('No definition found.'),
      ).toBeInTheDocument();
      expect(within(section('Images')).getByText('No good image found.')).toBeInTheDocument();
    });
  });

  describe('MODAL-10: errors and Retry', () => {
    it('shows the error in each section, and Retry looks up again', async () => {
      const { client, calls } = controlledClient();
      renderModal({ kind: 'both', client });
      await act(async () => {
        calls[0]?.reject(new Error('offline'));
        await Promise.resolve();
      });
      expect(screen.getAllByText("Couldn't load this. Try again.")).toHaveLength(2);
      expect(screen.getByRole('link', { name: 'Search Google ↗' })).toBeInTheDocument();

      const [retry] = screen.getAllByRole('button', { name: 'Retry' });
      if (retry) fireEvent.click(retry);
      expect(calls).toHaveLength(2);
      expect(within(section('Definition')).getByText('Loading…')).toBeInTheDocument();
      await act(async () => {
        calls[1]?.resolve({
          term: 'x',
          definition: { status: 'not-found' },
          images: { status: 'not-found' },
        });
        await Promise.resolve();
      });
      expect(screen.getByText('No definition found.')).toBeInTheDocument();
    });
  });

  describe('MODAL-11: closing cancels', () => {
    it('aborts a lookup that is still loading', () => {
      const { client, calls } = controlledClient();
      const { unmount } = renderModal({ client });
      expect(calls[0]?.signal.aborted).toBe(false);
      unmount();
      expect(calls[0]?.signal.aborted).toBe(true);
    });
  });

  describe('MODAL-12: S/M/L', () => {
    it('shows the current size as pressed, and reports a new one', () => {
      const { onSizeChange } = renderModal({ size: 'm' });
      expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(dialog()).toHaveAttribute('data-size', 'm');
      fireEvent.click(screen.getByRole('button', { name: 'Large' }));
      expect(onSizeChange).toHaveBeenCalledExactlyOnceWith('l');
    });
  });

  describe('MODAL-15/16: Close and focus', () => {
    it('focuses Close when it opens, and Close closes it', () => {
      const { onClose } = renderModal();
      const close = screen.getByRole('button', { name: 'Close' });
      expect(close).toHaveFocus();
      fireEvent.click(close);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on a click on the backdrop, not inside', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('heading', { level: 2 }));
      expect(onClose).not.toHaveBeenCalled();
      // A click on the ::backdrop is a click on the <dialog> itself.
      fireEvent.click(dialog());
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
