// From an imageinfo entry to an image we may show: licence, credit, URLs, alt text (IMG-6…11).
// Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import { THUMB_WIDTH } from './types';

/** The imageinfo parameters both details requests end with, in this order. */
export const FILE_DETAILS: Readonly<Record<string, string>> = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
  iiurlwidth: String(THUMB_WIDTH),
  iiextmetadatalanguage: 'en',
  iiextmetadatafilter:
    'ObjectName|ImageDescription|Artist|Attribution|LicenseShortName|LicenseUrl|License|NonFree',
};

// RED PHASE: stub until the implementation PR.
export const toLookupImage: (page: unknown, caption?: string) => LookupImage | undefined = () => {
  throw new Error('toLookupImage is not implemented yet');
};
