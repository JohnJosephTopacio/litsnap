// The lookup modal: term, source sentence, content, Google link. Spec: docs/features/lookup-modal.md.
import type {
  Attribution,
  DefinitionSection,
  ImageSection,
  LookupKind,
  LookupResult,
} from '@litsnap/shared';
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react';
import type { LookupSize } from '../storage/bookStore';
import type { LookupClient } from './client';
import { googleSearchUrl } from './google';
import type { SourceSentence } from './sourceSentence';

export interface LookupRequest {
  kind: LookupKind;
  /** The normalised lookup term (TERM-1…7): what's looked up and searched for. */
  term: string;
  /** The term as the header shows it (TERM-9). */
  display: string;
  sentence: SourceSentence;
}

interface LookupModalProps {
  request: LookupRequest;
  /** Undefined in production until M3: the modal says lookups are coming soon (MODAL-5). */
  client: LookupClient | undefined;
  size: LookupSize;
  onSizeChange: (size: LookupSize) => void;
  onClose: () => void;
}

const SIZES: [LookupSize, string, string][] = [
  ['s', 'S', 'Small'],
  ['m', 'M', 'Medium'],
  ['l', 'L', 'Large'],
];

type Lookup =
  { status: 'loading' } | { status: 'done'; result: LookupResult } | { status: 'error' };

/**
 * Runs the lookup, again on `retry()`, and aborts it when the modal closes (MODAL-6, 10, 11).
 * Results are tagged with their attempt, so a new attempt reads as loading until its own result
 * arrives, without setting state synchronously inside the effect.
 */
function useLookup(client: LookupClient | undefined, term: string, kind: LookupKind) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ attempt: number; lookup: Lookup }>();

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    const settle = (lookup: Lookup) => {
      if (!controller.signal.aborted) setSettled({ attempt, lookup });
    };
    client.lookup(term, kind, controller.signal).then(
      (result) => {
        settle({ status: 'done', result });
      },
      () => {
        settle({ status: 'error' });
      },
    );
    return () => {
      controller.abort();
    };
  }, [client, term, kind, attempt]);

  const lookup: Lookup = settled?.attempt === attempt ? settled.lookup : { status: 'loading' };
  const retry = () => {
    setAttempt((n) => n + 1);
  };
  return { lookup, retry };
}

/** Only http(s) links: these URLs will come from the Worker, i.e. from other sites, in M3. */
const isWebUrl = (url: string | undefined) => !!url && /^https?:\/\//i.test(url);

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function AttributionLine({ source }: { source: Attribution }) {
  const { sourceName, sourceUrl, licence, licenceUrl } = source;
  return (
    <p className="lookup-attribution">
      From{' '}
      {isWebUrl(sourceUrl) ? (
        <ExternalLink href={sourceUrl}>{sourceName}</ExternalLink>
      ) : (
        sourceName
      )}
      {licence && (
        <>
          {' · '}
          {isWebUrl(licenceUrl) && licenceUrl ? (
            <ExternalLink href={licenceUrl}>{licence}</ExternalLink>
          ) : (
            licence
          )}
        </>
      )}
    </p>
  );
}

function Definition({ definition }: { definition: DefinitionSection | undefined }) {
  if (definition?.status !== 'found') return <p>No definition found.</p>;
  return (
    <>
      {definition.fromWikipedia && (
        <p className="lookup-note">No dictionary entry. Summary from Wikipedia.</p>
      )}
      {definition.entries.map((entry, index) => (
        <div key={index} className="lookup-entry">
          <h4>{entry.partOfSpeech}</h4>
          <ol>
            {entry.senses.map((sense, senseIndex) => (
              <li key={senseIndex}>{sense}</li>
            ))}
          </ol>
        </div>
      ))}
      <AttributionLine source={definition.source} />
    </>
  );
}

function Images({ images }: { images: ImageSection | undefined }) {
  // The grid, enlarging and attribution arrive in M4.
  if (images?.status !== 'found' || images.images.length === 0) {
    return <p>No good image found.</p>;
  }
  return null;
}

function Section(props: {
  title: string;
  lookup: Lookup;
  retry: () => void;
  children: (result: LookupResult) => ReactNode;
}) {
  const titleId = useId();
  const { lookup } = props;
  return (
    <section
      className="lookup-section"
      aria-labelledby={titleId}
      aria-busy={lookup.status === 'loading'}
    >
      <h3 id={titleId}>{props.title}</h3>
      {lookup.status === 'loading' && <p>Loading…</p>}
      {lookup.status === 'error' && (
        <>
          <p>Couldn&apos;t load this. Try again.</p>
          <button type="button" onClick={props.retry}>
            Retry
          </button>
        </>
      )}
      {lookup.status === 'done' && props.children(lookup.result)}
    </section>
  );
}

export function LookupModal({ request, client, size, onSizeChange, ...props }: LookupModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  /** Whether the current press started on the backdrop (see the dialog's onClick). */
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  const { kind, term, display, sentence } = request;
  const { lookup, retry } = useLookup(client, term, kind);
  const onClose = useEffectEvent(props.onClose);

  // showModal(): the top layer, the dimmed ::backdrop, Esc, and an inert page behind (MODAL-1,
  // 15, 16). The browser fires `close` for Esc, the backdrop and the Close button alike.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const closed = () => {
      onClose();
    };
    element.addEventListener('close', closed);
    element.showModal();
    closeButton.current?.focus();
    return () => {
      element.removeEventListener('close', closed);
      if (element.open) element.close();
    };
  }, []);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="lookup-modal"
      data-size={size}
      aria-labelledby={titleId}
      // A click on the ::backdrop is a click on the <dialog> itself; everything inside is wrapped.
      // The press must start there too: pressing inside (selecting a definition's text, say) and
      // releasing outside also makes a click on the <dialog>, and mustn't close it.
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) close();
      }}
    >
      <div className="lookup-content">
        <header className="lookup-header">
          <h2 id={titleId}>{display}</h2>
          <div role="group" aria-label="Size" className="lookup-sizes">
            {SIZES.map(([value, letter, name]) => (
              <button
                key={value}
                type="button"
                aria-label={name}
                aria-pressed={size === value}
                onClick={() => {
                  onSizeChange(value);
                }}
              >
                {letter}
              </button>
            ))}
          </div>
          <button ref={closeButton} type="button" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <p className="lookup-sentence">
          {sentence.before}
          <mark>{sentence.match}</mark>
          {sentence.after}
        </p>

        {client ? (
          <>
            {kind !== 'image' && (
              <Section title="Definition" lookup={lookup} retry={retry}>
                {(result) => <Definition definition={result.definition} />}
              </Section>
            )}
            {kind !== 'definition' && (
              <Section title="Images" lookup={lookup} retry={retry}>
                {(result) => <Images images={result.images} />}
              </Section>
            )}
          </>
        ) : (
          <p className="lookup-note">Definitions and images are coming soon.</p>
        )}

        <footer className="lookup-footer">
          <ExternalLink href={googleSearchUrl(term, kind)}>Search Google ↗</ExternalLink>
        </footer>
      </div>
    </dialog>
  );
}
