// Modern Inbox (phase 3): every notification on a full page. Unread/All
// filter, grouped by day, each row links to its source, visible per-row
// actions (no right-click), bulk mark-read / clear. Same /api/notifications
// endpoints as the Legacy bell (via App's notificationActions).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { AtSign, Bell, CheckCheck, ListTodo, Mail, MailOpen, MoreHorizontal, Trash2, ArrowUpRight, Inbox as InboxIcon } from 'lucide-react';
import { cn } from '../../components/cn';
import {
  Button, ToggleGroup, ToggleGroupItem, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, Badge,
} from '../../components/ui-kit';
import { dayBucket, notificationTarget, type NotificationActions } from '../notifications';
import { Page, PageHeader, EmptyState } from '../ui/page';

export function InboxPage({ notifications, actions, onOpenChannel }: {
  notifications: any[];
  actions: NotificationActions;
  /** Jump to a channel (mentions). */
  onOpenChannel: (channelId: number) => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const unread = notifications.filter((n) => !n.is_read);
  const list = filter === 'unread' ? unread : notifications;

  const groups = useMemo(() => {
    const out: { label: string; items: any[] }[] = [];
    const sorted = [...list].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    for (const n of sorted) {
      const label = dayBucket(n.timestamp);
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [list]);

  const open = (n: any) => {
    const target = notificationTarget(n);
    if (!n.is_read) void actions.markRead([n.id]);
    if (!target) return;
    if (target.channelId != null) onOpenChannel(target.channelId);
    navigate(target.path);
  };

  return (
    <Page>
      <PageHeader
        title="Inbox"
        description={unread.length ? `${unread.length} unread notification${unread.length === 1 ? '' : 's'}` : 'You’re all caught up'}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!unread.length} onClick={() => void actions.markRead(unread.map((n) => n.id))}>
              <CheckCheck /> Mark all read
            </Button>
            <Button variant="ghost" size="sm" disabled={!notifications.length} onClick={() => void actions.clearAll()} className="hover:text-destructive">
              <Trash2 /> Clear all
            </Button>
          </>
        }
      >
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as any)} aria-label="Filter notifications">
          <ToggleGroupItem value="unread">Unread {unread.length > 0 && <Badge variant="new" className="ml-1">{unread.length}</Badge>}</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          icon={filter === 'unread' ? CheckCheck : InboxIcon}
          title={filter === 'unread' ? 'No unread notifications' : 'Your inbox is empty'}
          description="Mentions, task assignments and team updates land here."
          action={filter === 'unread' && notifications.length > 0 ? <Button variant="outline" size="sm" onClick={() => setFilter('all')}>Show all</Button> : undefined}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{g.label}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                <AnimatePresence initial={false}>
                  {g.items.map((n, i) => {
                    const isUnread = !n.is_read;
                    const target = notificationTarget(n);
                    const Icon = n.type === 'mention' ? AtSign : n.type === 'task' ? ListTodo : Bell;
                    return (
                      <motion.li
                        key={n.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
                        exit={{ opacity: 0, height: 0 }}
                        className={cn('group relative flex items-start gap-3 px-4 py-3.5', isUnread && 'bg-accent/[0.04]')}
                      >
                        {isUnread && <span className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" aria-label="Unread" />}
                        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', isUnread ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}>
                          <Icon className="size-4" />
                        </span>
                        <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                          <p className={cn('text-sm leading-relaxed', isUnread ? 'font-medium text-foreground' : 'text-muted-foreground')}>{n.content}</p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {n.timestamp ? format(new Date(n.timestamp), 'h:mm a') : ''}
                            {target && <span className="inline-flex items-center gap-0.5 text-foreground/70">{target.label} <ArrowUpRight className="size-3" /></span>}
                          </p>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Notification actions" className="shrink-0 text-muted-foreground"><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {target && <DropdownMenuItem onSelect={() => open(n)}><ArrowUpRight /> {target.label}</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => void (isUnread ? actions.markRead([n.id]) : actions.markUnread([n.id]))}>
                              {isUnread ? <MailOpen /> : <Mail />} {isUnread ? 'Mark as read' : 'Mark as unread'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove(n.id)}><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
