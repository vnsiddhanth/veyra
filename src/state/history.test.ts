import { describe, expect, it } from 'vitest';
import { createHistory, push, redo, replace, undo } from './history';

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
  });

  it('clears the redo stack on a new edit', () => {
    let h = push(push(createHistory('a'), 'b'), 'c');
    h = undo(h);
    h = push(h, 'd');
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe('d');
  });

  it('ignores no-op pushes and supports non-undoable replace', () => {
    let h = createHistory({ v: 1 });
    expect(push(h, h.present)).toBe(h);
    h = replace(h, { v: 2 });
    expect(h.past).toHaveLength(0);
    expect(h.present.v).toBe(2);
  });

  it('bounds memory', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 50; i++) h = push(h, i, 10);
    expect(h.past).toHaveLength(10);
    expect(h.past[0]).toBe(40);
  });
});
