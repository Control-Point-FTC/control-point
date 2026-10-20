import { describe, it, expect, afterEach, vi } from 'vitest';
import { BRUNO_NAVIGATE_EVENT, applyNavigateFromReply, applyNavigateKeepingCards, brunoGo, createdToOpen, hasConfirmCards, navigatePath, navigateRequest } from '../brunoNavigate';
import { stripEventBlocks } from '../aiService';

const reply = (json: string) => 'Opening your BOM page.\n```navigate\n' + json + '\n```';

describe("Bruno's navigate action", () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the app pages Bruno names', () => {
    expect(navigatePath({ to: 'calendar' })).toBe('/calendar');
    expect(navigatePath({ to: 'Tasks' })).toBe('/tasks');
    expect(navigatePath({ to: 'communications' })).toBe('/comm');
    expect(navigatePath({ to: 'messages' })).toBe('/chat');
  });

  it('opens one record by id', () => {
    expect(navigatePath({ to: 'notebook', page: 42 })).toBe('/notebook?page=42');
    expect(navigatePath({ to: 'notebook', section: '7' })).toBe('/notebook?section=7');
    expect(navigatePath({ to: 'tasks', task: 5 })).toBe('/tasks?task=5');
    expect(navigatePath({ to: 'calendar', event: 9 })).toBe('/calendar?event=9');
    expect(navigatePath({ to: 'members', member: 3 })).toBe('/teams?member=3');
    expect(navigatePath({ to: 'inventory', item: 11 })).toBe('/inventory?item=11');
    expect(navigatePath({ to: 'settings', section: 'bruno' })).toBe('/settings?section=bruno');
  });

  it('goes nowhere outside the app, and drops ids that are not whole numbers', () => {
    expect(navigatePath({ to: 'https://evil.example' })).toBeNull();
    expect(navigatePath({ to: '//evil.example' })).toBeNull();
    expect(navigatePath({ to: 'constructor' })).toBeNull();
    expect(navigatePath({ to: 'owner' })).toBeNull();
    expect(navigatePath(null)).toBeNull();
    expect(navigatePath({ to: 'tasks', task: '5&x=1' })).toBe('/tasks');
    expect(navigatePath({ to: 'notebook', page: -1 })).toBe('/notebook');
    expect(navigatePath({ to: 'settings', section: '../owner' })).toBe('/settings');
  });

  it('reads the block from a finished reply', () => {
    expect(navigateRequest(reply('{"to":"notebook","page":42}'))).toBe('/notebook?page=42');
    expect(navigateRequest('Calendar is on the left.')).toBeNull();
    expect(navigateRequest('```navigate\nnot json\n```')).toBeNull();
  });

  it('asks the app to go there', () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail.to);
    window.addEventListener(BRUNO_NAVIGATE_EVENT, on);
    expect(applyNavigateFromReply(reply('{"to":"calendar"}'))).toBe('/calendar');
    expect(applyNavigateFromReply('no block')).toBeNull();
    brunoGo('//evil.example');
    window.removeEventListener(BRUNO_NAVIGATE_EVENT, on);
    expect(seen).toEqual(['/calendar']);
  });

  it('the block never shows in the chat', () => {
    expect(stripEventBlocks(reply('{"to":"tasks"}'))).toBe('Opening your BOM page.');
    expect(stripEventBlocks('Opening…\n```navigate\n{"to')).toBe('Opening…');
  });
});

describe('opening what Bruno just created', () => {
  const task = (open?: boolean) => ({ kind: 'task', items: [{ title: 'Order servos', ...(open ? { open: true } : {}) }] });
  const event = (open?: boolean) => ({ kind: 'event', items: [{ title: 'Build day', date: '2026-10-24', ...(open ? { open: true } : {}) }] });

  it('opens the new task when asked to show it', () => {
    expect(createdToOpen([task(true)], { task: [17] })).toBe('/tasks?task=17');
  });

  it('opens the new event when only the event was asked for', () => {
    expect(createdToOpen([task(), event(true)], { task: [17], event: [4] })).toBe('/calendar?event=4');
  });

  it('a task asked for wins over an event', () => {
    expect(createdToOpen([task(true), event(true)], { task: [17], event: [4] })).toBe('/tasks?task=17');
  });

  it('opens the item that was flagged, not the first one', () => {
    const two = { kind: 'task', items: [{ title: 'A' }, { title: 'B', open: true }] };
    expect(createdToOpen([two], { task: [17, 18] })).toBe('/tasks?task=18');
    const split = [{ kind: 'event', items: [{ title: 'A' }] }, { kind: 'event', items: [{ title: 'B', open: true }] }];
    expect(createdToOpen(split, { event: [4, 5] })).toBe('/calendar?event=5');
  });

  it("opens nothing when some items weren't saved (positions no longer line up)", () => {
    const two = { kind: 'task', items: [{ title: 'A' }, { title: 'B', open: true }] };
    expect(createdToOpen([two], { task: [17] })).toBeNull();
  });

  it("stays put when nobody asked, or nothing was created", () => {
    expect(createdToOpen([task(), event()], { task: [17], event: [4] })).toBeNull();
    expect(createdToOpen([task(true)], {})).toBeNull();
  });
});

describe('a chat on its own page keeps its cards', () => {
  it("doesn't leave the page while a card waits for confirmation", () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail.to);
    window.addEventListener(BRUNO_NAVIGATE_EVENT, on);
    const withCard = 'Here it is:\n```tasks\n[{"title":"Order servos"}]\n```\n```navigate\n{"to":"calendar"}\n```';
    expect(hasConfirmCards(withCard)).toBe(true);
    expect(applyNavigateKeepingCards(withCard)).toBeNull();
    expect(applyNavigateKeepingCards('Opening.\n```navigate\n{"to":"calendar"}\n```')).toBe('/calendar');
    window.removeEventListener(BRUNO_NAVIGATE_EVENT, on);
    expect(seen).toEqual(['/calendar']);
  });
});
