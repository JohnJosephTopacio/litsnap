import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('shows the product name', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'LitSnap' })).toBeInTheDocument();
  });

  it('links to the Terms page in a new tab (TERMS-4)', () => {
    render(<App />);

    const link = screen.getByRole('link', { name: 'Terms' });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
