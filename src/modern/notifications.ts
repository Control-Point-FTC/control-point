// Notification helpers shared by the app shell, Modern Home and Modern Inbox.
import { format, isToday, isYesterday } from 'date-fns';

/** Notification mutations (same /api/notifications/* endpoints as the Legacy bell). */
export interface NotificationActions {
  markRead: (ids: number[]) => Promise<void> | void;
  markUnread: (ids: number[]) => Promise<void> | void;
  remove: (id: number) => Promise<void> | void;
  clearAll: () => Promise<void> | void;
  /** Open what a notification points at (mention → channel). Returns false when it has no target. */
  open: (n: any) => boolean;
}

/** Parsed `meta` JSON of a notification row ({} when missing or invalid). */
export function notifMeta(n: any): any {
  try { return n?.meta ? JSON.parse(n.meta) : {}; }
  catch { return {}; }
}

export interface NotificationTarget {
  /** Route to open. */
  path: string;
  /** Short label for the action ("Open channel", "Open in Tasks"). */
  label: string;
  /** True when the link points at the exact item; false = section fallback. */
  exact: boolean;
  channelId?: number;
}

/** Where a notification leads. Older rows without source ids fall back to
 *  their section, labelled honestly as "Open in …". */
export function notificationTarget(n: any): NotificationTarget | null {
  const meta = notifMeta(n);
  if (n?.type === 'mention' && meta.channel_id != null) {
    return { path: '/chat', label: `Open #${meta.channel_name || 'channel'}`, exact: true, channelId: Number(meta.channel_id) };
  }
  if (n?.type === 'task') {
    return meta.task_id != null
      ? { path: `/tasks?task=${Number(meta.task_id)}`, label: 'Open task', exact: true }
      : { path: '/tasks', label: 'Open in Tasks', exact: false };
  }
  if (meta.budget_id != null) return { path: '/budget', label: 'Open in Budget', exact: false };
  if (meta.outreach_id != null) return { path: '/outreach', label: 'Open in Outreach', exact: false };
  return null;
}

/** "Today" / "Yesterday" / "Mon, Oct 5" bucket label for grouping. */
export function dayBucket(ts: string | undefined): string {
  if (!ts) return 'Earlier';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, MMM d');
}
