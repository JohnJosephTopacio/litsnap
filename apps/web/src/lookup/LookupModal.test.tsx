// Acceptance criteria from docs/features/lookup-modal.md, for the component against the mock
// client. jsdom has no showModal(), so test-setup.ts stands in; Esc, the backdrop and the focus
// trap need a real browser and are in e2e/lookup-modal.spec.ts.
import type { LookupKind, LookupResult } from '@litsnap/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LookupSize } from '../storage/bookStore';
import type { LookupClient } from './client';
import { LookupModal, type LookupRequest } from './LookupModal';
import { createMockLookupClient, MOCK_TERMS } from './mockClient';

const request = (kind: LookupKind, term: string = MOCK_TERMS.found): LookupRequest => ({
  kind,
  term,
  display: 'Hipped-Roof',
  sentence: { before: 'The house had a ', match: 'Hipped-Roof', after: ' and two chimneys.' },
});

interface RenderOptions {
  kind?: LookupKind;
  term?: string;
  client?: LookupClient;
  size?: LookupSize;
}

function renderModal({
  kind = 'definition',
  term = MOCK_TERMS.found,
  client = createMockLookupClient({ delayMs: 0 }),
  size = 'm',
}: RenderOptions = {}) {
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

    it('links the source only for http(s) URLs, as they will come from other sites', async () => {
      const { client, calls } = controlledClient();
      renderModal({ client });
      await act(async () => {
        calls[0]?.resolve({
          term: 'x',
          definition: {
            status: 'found',
            from: 'dictionary',
            entries: [{ partOfSpeech: 'noun', senses: ['A sense.'] }],
            source: {
              sourceName: 'Evil source',
              sourceUrl: 'javascript:alert(1)',
              licence: 'Evil licence',
              licenceUrl: 'data:text/html,hi',
            },
          },
        });
        await Promise.resolve();
      });
      expect(screen.getByText(/Evil source/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Evil source' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Evil licence' })).toBeNull();
    });

    it('labels a Wikipedia summary, and shows it under the article title', async () => {
      renderModal({ term: MOCK_TERMS.wikipedia });
      const definition = section('Definition');
      expect(
        await within(definition).findByText('No dictionary entry. Summary from Wikipedia.'),
      ).toBeInTheDocument();
      expect(within(definition).getByRole('heading', { name: 'Flying buttress' })).toBeVisible();
      expect(within(definition).getByText(/^A sloping support/).tagName).toBe('P');
      expect(within(definition).queryByRole('list')).toBeNull();
    });

    it("shows a followed cross-reference's note above the entries (DEF-10)", async () => {
      const { client, calls } = controlledClient();
      renderModal({ client });
      await act(async () => {
        calls[0]?.resolve({
          term: 'x',
          definition: {
            status: 'found',
            from: 'dictionary',
            note: 'Synonym of hip roof.',
            entries: [{ partOfSpeech: 'noun', senses: ['A roof with no gables.'] }],
            source: {
              sourceName: 'Wiktionary',
              sourceUrl: 'https://en.wiktionary.org/wiki/hip_roof',
            },
          },
        });
        await Promise.resolve();
      });
      const note = within(section('Definition')).getByText('Synonym of hip roof.');
      const heading = within(section('Definition')).getByRole('heading', { name: 'noun' });
      expect(note.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    it('ignores a cancelled lookup that fails afterwards', async () => {
      const { client, calls } = controlledClient();
      const { rerender } = renderModal({ client });
      // A new request in the same modal cancels the first lookup…
      rerender(
        <LookupModal
          request={request('definition', 'flying buttress')}
          client={client}
          size="m"
          onSizeChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(calls[0]?.signal.aborted).toBe(true);
      // …whose AbortError then arrives: the new lookup is still loading, not failed.
      await act(async () => {
        calls[0]?.reject(new DOMException('Aborted', 'AbortError'));
        await Promise.resolve();
      });
      expect(within(section('Definition')).getByText('Loading…')).toBeInTheDocument();
    });

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
      fireEvent.pointerDown(dialog());
      fireEvent.click(dialog());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('stays open when a press inside ends on the backdrop (e.g. selecting text)', () => {
      const { onClose } = renderModal();
      fireEvent.pointerDown(screen.getByRole('heading', { level: 2 }));
      fireEvent.click(dialog()); // the browser targets the common ancestor: the <dialog>
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
