/** Response body of the Worker's `GET /health` endpoint. */
export interface HealthResponse {
  status: 'ok';
  service: 'litsnap-worker';
}

export { countWords, displayTerm, MAX_LOOKUP_WORDS, normalise } from './term';
export type {
  Attribution,
  DefinitionSection,
  DictionaryDefinition,
  FoundDefinition,
  ImageSection,
  LookupImage,
  LookupKind,
  LookupResult,
  WikipediaSummary,
} from './lookup';
