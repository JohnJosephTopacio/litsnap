// The colour tokens for our interface and the book. Spec: docs/features/visual-design.md.
// styles.css repeats these as custom properties; theme.test.ts fails if they differ (VIS-1).
import type { Theme } from './storage/bookStore';

export interface Tokens {
  /** Page and book background, cards, panels. */
  paper: string;
  /** Text, book links, filled pills, progress fill, focus ring. */
  ink: string;
  /** Secondary text: labels, the title in the top bar, credits, hints. */
  ink2: string;
  /** Outlines of controls and other non-text marks. Never text: it fails AA on both papers (VIS-2). */
  mark: string;
  /** Hairlines and card borders (decorative). */
  rule: string;
  /** Progress track, hovered menu items, image placeholders. */
  track: string;
  /** The lookup modal's backdrop. */
  dim: string;
}

export const TOKENS = {
  light: {
    paper: '#f6f4ee',
    ink: '#111111',
    ink2: '#333333',
    mark: '#777777',
    rule: '#beb8ad',
    track: '#e6e1d7',
    dim: 'rgb(51 47 40 / 32%)',
  },
  dark: {
    paper: '#111111',
    ink: '#e6e1d7',
    ink2: '#beb8ad',
    mark: '#777777',
    rule: '#333333',
    track: '#333333',
    dim: 'rgb(0 0 0 / 55%)',
  },
} as const satisfies Record<Theme, Tokens>;
