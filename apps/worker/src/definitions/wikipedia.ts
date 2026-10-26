// The Wikipedia article summary for the exact title, when no dictionary has the term (DEF-15, DEF-16).
// Spec: docs/features/definition-providers.md.
import { getJson, pageTitle } from './http';
import { isRecord } from './text';
import type { DefinitionProvider, ProviderOutcome } from './types';

const API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

const UNEXPECTED: ProviderOutcome = { status: 'failed', reason: 'unexpected response' };

export const wikipedia: DefinitionProvider = {
  name: 'wikipedia',
  async lookup(term, context) {
    const title = pageTitle(term);
    if (title === undefined) return { status: 'not-found' };
    const reply = await getJson(API + title, context, [400, 404]);
    if (reply.status === 'missing') return { status: 'not-found' };
    if (reply.status === 'failed') return reply;

    const { body } = reply;
    if (!isRecord(body) || typeof body.type !== 'string') return UNEXPECTED;
    // Disambiguation and no-extract pages aren't definitions (DEF-16).
    if (body.type !== 'standard') return { status: 'not-found' };
    const desktop = isRecord(body.content_urls) ? body.content_urls.desktop : undefined;
    const page = isRecord(desktop) ? desktop.page : undefined;
    if (typeof body.title !== 'string' || typeof body.extract !== 'string') return UNEXPECTED;
    if (typeof page !== 'string') return UNEXPECTED;
    const summary = body.extract.trim();
    if (summary === '') return { status: 'not-found' };
    return {
      status: 'found',
      definition: {
        from: 'wikipedia',
        title: body.title,
        summary,
        source: {
          sourceName: 'Wikipedia',
          sourceUrl: page,
          licence: 'CC BY-SA 4.0',
          licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        },
      },
    };
  },
};
