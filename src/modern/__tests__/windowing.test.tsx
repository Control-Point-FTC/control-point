import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { LoadMore, Spacer, useIncrementalGroups, useVirtualRows } from '../ui/windowing';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

// jsdom has no layout: give the scroll container (#main) a real size so the
// virtualizer has a viewport to fill.
const VIEW_H = 600;
const ROW_H = 40;

// A controllable IntersectionObserver: tests decide when the end of a list
// "scrolls into view".
let observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
class FakeIO {
  constructor(private cb: IntersectionObserverCallback) { observers.push({ cb }); }
  observe(el: Element) { const o = observers.find((x) => x.cb === this.cb); if (o) o.el = el; }
  unobserve() {}
  disconnect() { observers = observers.filter((o) => o.cb !== this.cb); }
  takeRecords() { return []; }
}
const scrollEndIntoView = () => act(() => {
  for (const o of [...observers]) o.cb([{ isIntersecting: true, target: o.el } as any], {} as any);
});

const items = Array.from({ length: 500 }, (_, i) => `Item ${i + 1}`);
const rendered = () => screen.queryAllByText(/^Item \d+$/);

function VirtualList({ list }: { list: string[] }) {
  const vr = useVirtualRows(list.length, ROW_H);
  return (
    <ul ref={vr.ref as any} aria-label="list">
      <Spacer as="li" height={vr.paddingTop} />
      {vr.rows(list).map(({ item, rowProps }) => <li key={item} {...rowProps} style={{ height: ROW_H }}>{item}</li>)}
      <Spacer as="li" height={vr.paddingBottom} />
    </ul>
  );
}

function Groups({ list }: { list: string[] }) {
  const [filter, setFilter] = useState('a');
  const inc = useIncrementalGroups(40, filter);
  return (
    <>
      <button type="button" onClick={() => setFilter((f) => f + 'x')}>New search</button>
      <ul aria-label="column">
        {inc.slice('col', list, (x) => x === 'Item 99').map((x) => <li key={x}>{x}</li>)}
        <LoadMore as="li" hidden={inc.hidden('col', list.length)} onMore={() => inc.more('col')} />
      </ul>
    </>
  );
}

let main: HTMLElement;
const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const box = (h: number) => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: h, width: 800, height: h, toJSON() {} }) as DOMRect;
beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
  main = document.createElement('main');
  main.id = 'main';
  Object.defineProperty(main, 'offsetHeight', { configurable: true, value: VIEW_H });
  Object.defineProperty(main, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(main, 'clientHeight', { configurable: true, value: VIEW_H });
  main.getBoundingClientRect = () => box(VIEW_H);
  // Rows measure ROW_H tall (the virtualizer reads offsetHeight; jsdom says 0).
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) { return this.tagName === 'LI' && this.textContent?.startsWith('Item') ? ROW_H : 0; },
  });
  document.body.appendChild(main);
});
afterEach(() => {
  cleanup(); main.remove(); vi.unstubAllGlobals();
  if (realOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight);
  else delete (HTMLElement.prototype as any).offsetHeight;
});
const mount = (ui: React.ReactElement) => render(ui, { container: main.appendChild(document.createElement('div')) });

describe('windowed lists', () => {
  it('render the rows that fill the viewport (never a blank list), not all 500', () => {
    mount(<VirtualList list={items} />);
    const n = rendered().length;
    expect(n).toBeGreaterThanOrEqual(Math.ceil(VIEW_H / ROW_H));
    expect(n).toBeLessThan(60);
    expect(rendered()[0]).toHaveTextContent('Item 1');
  });

  it('scrolling moves the window and visible rows stay present', () => {
    mount(<VirtualList list={items} />);
    act(() => {
      main.scrollTop = 200 * ROW_H;
      fireEvent.scroll(main);
    });
    const names = rendered().map((el) => el.textContent);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('Item 201');
    expect(names).not.toContain('Item 1');
  });

  it('short lists render every row', () => {
    mount(<VirtualList list={items.slice(0, 30)} />);
    expect(rendered()).toHaveLength(30);
  });

  it('printing renders every row, then windows again', () => {
    mount(<VirtualList list={items} />);
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(rendered()).toHaveLength(500);
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(rendered().length).toBeLessThan(60);
    expect(rendered().length).toBeGreaterThan(0);
  });
});

describe('incremental groups', () => {
  it('load more when the end scrolls into view, and on the button', () => {
    render(<Groups list={items.slice(0, 200)} />);
    expect(rendered()).toHaveLength(41); // 40, plus the pinned Item 99
    scrollEndIntoView();
    expect(rendered()).toHaveLength(81);
    fireEvent.click(screen.getByRole('button', { name: 'Show more (120 left)' }));
    expect(rendered()).toHaveLength(120); // Item 99 is now inside the range
  });

  it('a pinned item past the loaded range stays visible', () => {
    render(<Groups list={items.slice(0, 200)} />);
    expect(screen.getByText('Item 99')).toBeInTheDocument();
  });

  it('a new search starts over', () => {
    render(<Groups list={items.slice(0, 200)} />);
    scrollEndIntoView();
    expect(rendered()).toHaveLength(81);
    fireEvent.click(screen.getByRole('button', { name: 'New search' }));
    expect(rendered()).toHaveLength(41);
  });
});
