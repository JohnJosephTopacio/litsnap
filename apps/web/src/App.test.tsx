import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

// No stored book, so App shows the open screen once startup finishes. (jsdom has no IndexedDB;
// the real store is covered by the storage tests and Playwright.)
vi.mock('./storage/appStore', () => ({
  appStore: () => Promise.resolve({ getCurrentBook: () => Promise.resolve(undefined) }),
}));

describe('App', () => {
  it('shows the product name', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'LitSnap' })).toBeInTheDocument();
  });

  it('links to the Terms page in a new tab (TERMS-4)', async () => {
    render(<App />);

    const link = await screen.findByRole('link', { name: 'Terms' });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
