// The reader's settings popover (RD-15, RD-16, RD-18, RD-28, lookup-modal MODAL-13, reader-chrome
// CHROME-11) and the Terms
// link (TERMS-4).
import { useEffect, useRef } from 'react';
import type { Controls, Layout, LookupSize, Settings, Theme } from '../storage/bookStore';

export const FONT_STEP = 10;
export const FONT_MIN = 80;
export const FONT_MAX = 200;

interface SettingsPanelProps {
  settings: Settings;
  /** The theme in use, which may come from the OS rather than `settings.theme`. */
  theme: Theme;
  /** Fixed-layout book: text size and layout don't apply (RD-28). */
  fixedLayout: boolean;
  onChange: (patch: Partial<Settings>) => void;
}

function Choice<T extends string>(props: {
  label: string;
  options: [T, string][];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={props.label} className="settings-row">
      <span aria-hidden="true" className="label">
        {props.label}
      </span>
      {props.options.map(([value, text]) => (
        <button
          key={value}
          type="button"
          className="pill-option"
          aria-pressed={props.value === value}
          disabled={props.disabled}
          onClick={() => {
            props.onChange(value);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({ settings, theme, fixedLayout, onChange }: SettingsPanelProps) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  const size = settings.fontSize;
  return (
    <section ref={panel} className="settings-panel" aria-label="Reader settings">
      {fixedLayout && (
        <p className="settings-note">
          This book has a fixed page layout, so text size and layout don&apos;t apply.
        </p>
      )}
      <div role="group" aria-label="Text size" className="settings-row">
        <span aria-hidden="true" className="label">
          Text size
        </span>
        <button
          type="button"
          className="pill-option"
          aria-label="Smaller text"
          disabled={fixedLayout || size <= FONT_MIN}
          onClick={() => {
            onChange({ fontSize: size - FONT_STEP });
          }}
        >
          A−
        </button>
        <output aria-live="polite">{size}%</output>
        <button
          type="button"
          className="pill-option"
          aria-label="Larger text"
          disabled={fixedLayout || size >= FONT_MAX}
          onClick={() => {
            onChange({ fontSize: size + FONT_STEP });
          }}
        >
          A+
        </button>
      </div>
      <Choice<Theme>
        label="Theme"
        options={[
          ['light', 'Light'],
          ['dark', 'Dark'],
        ]}
        value={theme}
        onChange={(value) => {
          onChange({ theme: value });
        }}
      />
      <Choice<Layout>
        label="Layout"
        options={[
          ['paginated', 'Paginated'],
          ['scrolled', 'Scrolled'],
        ]}
        value={settings.layout}
        disabled={fixedLayout}
        onChange={(value) => {
          onChange({ layout: value });
        }}
      />
      <Choice<LookupSize>
        label="Lookup size"
        options={[
          ['s', 'Small'],
          ['m', 'Medium'],
          ['l', 'Large'],
        ]}
        value={settings.lookupSize}
        onChange={(value) => {
          onChange({ lookupSize: value });
        }}
      />
      <Choice<Controls>
        label="Controls"
        options={[
          ['auto-hide', 'Auto-hide'],
          ['always', 'Always shown'],
        ]}
        value={settings.controls}
        onChange={(value) => {
          onChange({ controls: value });
        }}
      />
      {/* New tab, so the reader is never interrupted (TERMS-4). */}
      <a className="label" href="/terms" target="_blank" rel="noopener noreferrer">
        Terms
      </a>
    </section>
  );
}
