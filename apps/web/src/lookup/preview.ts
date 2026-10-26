// TEMPORARY (MENU-15): lookups stay off in production until the lookup modal lands, so the public
// site never shows a menu that does nothing. The lookup-modal PR deletes this file.

/** Set to `'on'` in localStorage to try lookups in a production build (Playwright does). */
export const LOOKUPS_PREVIEW_KEY = 'litsnap:lookups-preview';

export function lookupsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(LOOKUPS_PREVIEW_KEY) === 'on';
  } catch {
    return false; // storage blocked: behave like production
  }
}
