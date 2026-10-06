// Inbox (Modern): notifications in a side sheet with visible per-item actions
// (no right-click-only actions). Items are only marked read when the user
// reads them, not when the sheet opens. Same /api/notifications/* endpoints.
import { format } from 'date-fns';
import { AtSign, Bell, Check, CheckCheck, Mail, MailOpen, Trash2 } from 'lucide-react';
import { cn } from '../components/cn';
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui-kit';

export interface NotificationActions {
  markRead: (ids: number[]) => Promise<void> | void;
  markUnread: (ids: number[]) => Promise<void> | void;
  remove: (id: number) => Promise<void> | void;
  clearAll: () => Promise<void> | void;
  /** Open what a notification points at (mention → channel). Returns false when it has no target. */
  open: (n: any) => boolean;
}

export function InboxSheet({ open, onOpenChange, notifications, actions }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  notifications: any[];
  actions: NotificationActions;
  onNavigate: (path: string) => void;
}) {
  const unread = notifications.filter((n) => !n.is_read);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0">
        <SheetHeader className="border-b border-line px-5 py-4">
          <SheetTitle className="text-base">Inbox</SheetTitle>
          <SheetDescription>{unread.length ? `${unread.length} unread` : 'You’re all caught up'}</SheetDescription>
        </SheetHeader>
        {notifications.length > 0 && (
          <div className="flex items-center gap-2 border-b border-line px-5 py-2">
            <Button variant="ghost" size="sm" disabled={!unread.length} onClick={() => void actions.markRead(unread.map((n) => n.id))}>
              <CheckCheck /> Mark all read
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto hover:text-rose-500" onClick={() => void actions.clearAll()}>
              <Trash2 /> Clear all
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Bell className="size-8 text-text-muted/50" />
              <p className="text-sm font-medium text-text-base">No notifications</p>
              <p className="text-sm text-text-muted">Mentions, task assignments and updates show up here.</p>
            </div>
          ) : (
            <ul>
              {notifications.map((n) => {
                const isUnread = !n.is_read;
                const Icon = n.type === 'mention' ? AtSign : Bell;
                return (
                  <li key={n.id} className={cn('group flex gap-3 border-b border-line px-5 py-3.5', isUnread && 'bg-accent/[0.04]')}>
                    <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', isUnread ? 'bg-accent/15 text-accent' : 'bg-text-base/[0.06] text-text-muted')}>
                      <Icon className="size-3.5" />
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded"
                      onClick={() => {
                        if (isUnread) void actions.markRead([n.id]);
                        if (actions.open(n)) onOpenChange(false);
                      }}
                    >
                      <p className={cn('text-sm leading-relaxed', isUnread ? 'text-text-base' : 'text-text-muted')}>{n.content}</p>
                      <p className="mt-1 text-xs text-text-muted">{n.timestamp ? format(new Date(n.timestamp), 'MMM d, h:mm a') : ''}</p>
                    </button>
                    <div className="flex shrink-0 items-start gap-0.5">
                      <button
                        type="button"
                        aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
                        onClick={() => void (isUnread ? actions.markRead([n.id]) : actions.markUnread([n.id]))}
                        className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-text-base/[0.08] hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                      >
                        {isUnread ? <MailOpen className="size-3.5" /> : <Mail className="size-3.5" />}
                      </button>
                      <button
                        type="button"
                        aria-label="Delete notification"
                        onClick={() => void actions.remove(n.id)}
                        className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-rose-500/10 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {unread.length === 0 && notifications.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 border-t border-line py-2.5 text-xs text-text-muted"><Check className="size-3.5" /> All read</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
