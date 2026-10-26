// Acceptance criteria MENU-7 and MENU-11 from docs/features/selection-menu.md, for the component.
// Real selections, placement on screen, Enter/Space and the shortcut keys in the book are covered by
// e2e/selection-menu.spec.ts.
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { kindForKey, SelectionMenu, type SelectionMenuHandle } from './SelectionMenu';

const line = { left: 100, top: 100, right: 180, bottom: 120 };
const anchor = { first: line, last: line, bounds: { left: 0, top: 0, right: 800, bottom: 600 } };

const renderMenu = () => {
  const onChoose = vi.fn();
  const ref = createRef<SelectionMenuHandle>();
  render(<SelectionMenu anchor={anchor} onChoose={onChoose} ref={ref} />);
  return { onChoose, ref };
};

describe('SelectionMenu', () => {
  describe('MENU-11: keyboard and screen readers', () => {
    it('is a menu labelled "Look up" with three items and their shortcuts', () => {
      renderMenu();
      const menu = screen.getByRole('menu', { name: 'Look up' });
      const items = screen.getAllByRole('menuitem');
      expect(menu).toContainElement(items[0] ?? null);
      expect(items.map((item) => item.textContent)).toEqual(['DefinitionD', 'ImageI', 'BothB']);
      expect(items.map((item) => item.getAttribute('aria-keyshortcuts'))).toEqual(['D', 'I', 'B']);
      // The visible key hint isn't part of the name.
      expect(screen.getByRole('menuitem', { name: 'Definition' })).toBeInTheDocument();
    });

    it("doesn't take focus when it appears", () => {
      renderMenu();
      expect(document.activeElement).toBe(document.body);
    });

    it('focusFirst() focuses Definition', () => {
      const { ref } = renderMenu();
      ref.current?.focusFirst();
      expect(screen.getByRole('menuitem', { name: 'Definition' })).toHaveFocus();
    });

    it('moves with the arrow keys, wrapping round, and Home/End', () => {
      const { ref } = renderMenu();
      ref.current?.focusFirst();
      const focused = () => document.activeElement?.getAttribute('aria-keyshortcuts');
      const press = (key: string) => {
        if (document.activeElement) fireEvent.keyDown(document.activeElement, { key });
      };

      press('ArrowDown');
      expect(focused()).toBe('I');
      press('ArrowDown');
      press('ArrowDown');
      expect(focused()).toBe('D');
      press('ArrowUp');
      expect(focused()).toBe('B');
      press('Home');
      expect(focused()).toBe('D');
      press('End');
      expect(focused()).toBe('B');
    });

    it('contains() tells clicks on the menu from clicks elsewhere', () => {
      const { ref } = renderMenu();
      expect(ref.current?.contains(screen.getByRole('menuitem', { name: 'Image' }))).toBe(true);
      expect(ref.current?.contains(document.body)).toBe(false);
      expect(ref.current?.contains(null)).toBe(false);
    });
  });

  describe('MENU-7: choosing', () => {
    it.each([
      ['Definition', 'definition'],
      ['Image', 'image'],
      ['Both', 'both'],
    ])('clicking %s chooses %s', (name, kind) => {
      const { onChoose } = renderMenu();
      fireEvent.click(screen.getByRole('menuitem', { name }));
      expect(onChoose).toHaveBeenCalledExactlyOnceWith(kind);
    });

    it.each([
      ['d', 'definition'],
      ['D', 'definition'],
      ['i', 'image'],
      ['I', 'image'],
      ['b', 'both'],
      ['B', 'both'],
    ])('the key %s chooses %s', (key, kind) => {
      expect(kindForKey(key)).toBe(kind);
    });

    it('other keys choose nothing', () => {
      expect(kindForKey('x')).toBeUndefined();
      expect(kindForKey('Enter')).toBeUndefined();
    });
  });
});
