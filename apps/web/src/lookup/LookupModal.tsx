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
import { ImageGrid } from './ImageGrid';
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
  client: LookupClient;
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
 * arrives, without setting state synchronously inside the effect. A `lazy` lookup waits for the
 * first `retry()` and is `undefined` until then: one section's own retry (MODAL-20).
 */
function useLookup(
  client: LookupClient,
  term: string,
  kind: LookupKind,
): { lookup: Lookup; retry: () => void };
function useLookup(
  client: LookupClient,
  term: string,
  kind: LookupKind,
  lazy: true,
): { lookup: Lookup | undefined; retry: () => void };
function useLookup(client: LookupClient, term: string, kind: LookupKind, lazy = false) {
  const first = lazy ? -1 : 0;
  const [attempt, setAttempt] = useState(first);
  const [settled, setSettled] = useState<{ attempt: number; lookup: Lookup }>();

  useEffect(() => {
    if (attempt < 0) return;
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

  const lookup: Lookup | undefined =
    attempt < 0 ? undefined : settled?.attempt === attempt ? settled.lookup : { status: 'loading' };
  const retry = () => {
    setAttempt((n) => n + 1);
  };
  return { lookup, retry };
}

/** Only http(s) links: these URLs come from the Worker, i.e. from other sites. */
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
  if (definition.from === 'wikipedia') {
    return (
      <>
        <p className="lookup-note">No dictionary entry. Summary from Wikipedia.</p>
        <div className="lookup-entry">
          <h4>{definition.title}</h4>
          <p>{definition.summary}</p>
        </div>
        <AttributionLine source={definition.source} />
      </>
    );
  }
  return (
    <>
      {definition.note && <p className="lookup-note">{definition.note}</p>}
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

/** An empty list reads as "No good image found." too: the grid says so when none are left. */
function Images({ images }: { images: ImageSection | undefined }) {
  if (images?.status !== 'found') return <p>No good image found.</p>;
  return <ImageGrid images={images.images} />;
}

function Section(props: {
  title: string;
  /** The modal's lookup. */
  lookup: Lookup;
  retry: () => void;
  /** This section's own retry, once it has started (MODAL-20). */
  own: Lookup | undefined;
  retryOwn: () => void;
  /** This section's part of a result. */
  part: (result: LookupResult) => { status: string } | undefined;
  children: (result: LookupResult) => ReactNode;
}) {
  const titleId = useId();
  const lookup = props.own ?? props.lookup;
  // A section that failed on its own retries on its own; a whole failure retries the whole
  // lookup (MODAL-10, 19, 20).
  const failedAlone = lookup.status === 'done' && props.part(lookup.result)?.status === 'failed';
  const retry = failedAlone || props.own ? props.retryOwn : props.retry;
  return (
    <section
      className="lookup-section"
      aria-labelledby={titleId}
      aria-busy={lookup.status === 'loading'}
    >
      <h3 id={titleId}>{props.title}</h3>
      {lookup.status === 'loading' && <p>Loading…</p>}
      {(lookup.status === 'error' || failedAlone) && (
        <>
          <p>Couldn&apos;t load this. Try again.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </>
      )}
      {lookup.status === 'done' && !failedAlone && props.children(lookup.result)}
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
  const definitionAgain = useLookup(client, term, 'definition', true);
  const imagesAgain = useLookup(client, term, 'image', true);
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

        {kind !== 'image' && (
          <Section
            title="Definition"
            lookup={lookup}
            retry={retry}
            own={definitionAgain.lookup}
            retryOwn={definitionAgain.retry}
            part={(result) => result.definition}
          >
            {(result) => <Definition definition={result.definition} />}
          </Section>
        )}
        {kind !== 'definition' && (
          <Section
            title="Images"
            lookup={lookup}
            retry={retry}
            own={imagesAgain.lookup}
            retryOwn={imagesAgain.retry}
            part={(result) => result.images}
          >
            {(result) => <Images images={result.images} />}
          </Section>
        )}

        <footer className="lookup-footer">
          <ExternalLink href={googleSearchUrl(term, kind)}>Search Google ↗</ExternalLink>
        </footer>
      </div>
    </dialog>
  );
}
