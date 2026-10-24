// Reader settings (book-storage STO-12…14) as React state, plus the OS dark-mode preference.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { appStore } from '../storage/appStore';
import type { Settings } from '../storage/bookStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/** Whether the OS is in dark mode, updating live if the user switches it. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribeToColorScheme, () => window.matchMedia(DARK_QUERY).matches);
}

/**
 * `settings` is undefined until loaded. `update` applies a change immediately and saves it in
 * the background; the store clamps font size, and we keep whatever it saved.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>();

  useEffect(() => {
    let cancelled = false;
    appStore()
      .then((store) => store.getSettings())
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => current && { ...current, ...patch });
    appStore()
      .then((store) => store.updateSettings(patch))
      .then(setSettings)
      .catch(console.error);
  }, []);

  return { settings, update };
}
