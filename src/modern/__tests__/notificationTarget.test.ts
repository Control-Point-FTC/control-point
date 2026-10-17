import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../notifications';

describe('notification links', () => {
  it('an @mention in a notebook page opens that page', () => {
    expect(notificationTarget({ type: 'mention', meta: JSON.stringify({ notebook_page_id: 12 }) }))
      .toEqual({ path: '/notebook?page=12', label: 'Open page', exact: true });
  });
  it('a chat mention still opens its channel', () => {
    expect(notificationTarget({ type: 'mention', meta: JSON.stringify({ channel_id: 3, channel_name: 'build' }) }))
      .toMatchObject({ path: '/chat', channelId: 3 });
  });
});
