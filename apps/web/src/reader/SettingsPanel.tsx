// The reader's settings popover (RD-15, RD-16, RD-18) and the Terms link (TERMS-4).
import { useEffect, useRef } from 'react';
import type { Layout, Settings, Theme } from '../storage/bookStore';

export const FONT_STEP = 10;
export const FONT_MIN = 80;
export const FONT_MAX = 200;

interface SettingsPanelProps {
  settings: Settings;
  /** The theme in use, which may come from the OS rather than `settings.theme`. */
  theme: Theme;
  onChange: (patch: Partial<Settings>) => void;
}

function Choice<T extends string>(props: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={props.label} className="settings-row">
      <span aria-hidden="true">{props.label}</span>
      {props.options.map(([value, text]) => (
        <button
          key={value}
          type="button"
          aria-pressed={props.value === value}
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

export function SettingsPanel({ settings, theme, onChange }: SettingsPanelProps) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.querySelector('button')?.focus();
  }, []);

  const size = settings.fontSize;
  return (
    <section ref={panel} className="settings-panel" aria-label="Reader settings">
      <div role="group" aria-label="Text size" className="settings-row">
        <span aria-hidden="true">Text size</span>
        <button
          type="button"
          aria-label="Smaller text"
          disabled={size <= FONT_MIN}
          onClick={() => {
            onChange({ fontSize: size - FONT_STEP });
          }}
        >
          −
        </button>
        <output aria-live="polite">{size}%</output>
        <button
          type="button"
          aria-label="Larger text"
          disabled={size >= FONT_MAX}
          onClick={() => {
            onChange({ fontSize: size + FONT_STEP });
          }}
        >
          +
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
        onChange={(value) => {
          onChange({ layout: value });
        }}
      />
      {/* New tab, so the reader is never interrupted (TERMS-4). */}
      <a href="/terms" target="_blank" rel="noopener noreferrer">
        Terms
      </a>
    </section>
  );
}
