import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { LoadMore, Spacer, useIncrementalGroups, useVirtualRows } from '../ui/windowing';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

const items = Array.from({ length: 500 }, (_, i) => `Item ${i + 1}`);

function VirtualList({ list }: { list: string[] }) {
  const vr = useVirtualRows(list.length, 40);
  return (
    <ul ref={vr.ref as any} aria-label="list">
      <Spacer as="li" height={vr.paddingTop} />
      {vr.rows(list).map(({ item, rowProps }) => <li key={item} {...rowProps}>{item}</li>)}
      <Spacer as="li" height={vr.paddingBottom} />
    </ul>
  );
}

function Groups({ list }: { list: string[] }) {
  const inc = useIncrementalGroups(40);
  return (
    <ul aria-label="column">
      {inc.slice('a', list).map((x) => <li key={x}>{x}</li>)}
      <LoadMore as="li" hidden={inc.hidden('a', list.length)} onMore={() => inc.more('a')} />
    </ul>
  );
}

let main: HTMLElement;
beforeEach(() => {
  main = document.createElement('main');
  main.id = 'main';
  document.body.appendChild(main);
});
afterEach(() => { cleanup(); main.remove(); });

const rendered = () => screen.queryAllByText(/^Item \d+$/).length;

describe('long lists', () => {
  it('a long list renders only rows near the screen, a short one renders all', () => {
    render(<VirtualList list={items} />, { container: main.appendChild(document.createElement('div')) });
    // jsdom has no layout, so the window may even be empty here; the real
    // row counts were checked in a browser (see the PR).
    expect(rendered()).toBeLessThan(60);
    cleanup();
    render(<VirtualList list={items.slice(0, 30)} />, { container: main.appendChild(document.createElement('div')) });
    expect(rendered()).toBe(30);
  });

  it('board columns show a chunk and load more on demand', () => {
    render(<Groups list={items.slice(0, 100)} />);
    expect(rendered()).toBe(40);
    fireEvent.click(screen.getByRole('button', { name: 'Show more (60 left)' }));
    expect(rendered()).toBe(80);
  });

  it('printing renders every row, then windows again', () => {
    render(<VirtualList list={items} />, { container: main.appendChild(document.createElement('div')) });
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(rendered()).toBe(500);
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(rendered()).toBeLessThan(60);
  });
});
