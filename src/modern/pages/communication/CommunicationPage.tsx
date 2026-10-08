// Modern Communication (phase 6d): the team's shared log of emails and
// announcements, as threads. Rebuilt on the kit over the shared
// useCommunicationController (same /api/communications calls, threading,
// optimistic delete, "did they respond?" follow-up). Writes need the
// `communications` scope; everyone can read.
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownLeft, ArrowUpRight, ChevronDown, Clock, FileUp, Mail, Megaphone, MessageSquareReply, Pencil, Plus, Search, Sparkles, Trash2,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea,
  ToggleGroup, ToggleGroupItem, RequiredMark,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { ImportEmailDialog, QuickAddDialog } from './LogDialogs';
import { useCommunicationController } from '../../../components/communication/useCommunicationController';
import { Page, PageHeader, EmptyState } from '../../ui/page';
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from '../../ui/selection';
import { useContextMenu } from '../../../components/contextmenu/ContextMenuProvider';

const NONE: any[] = [];
const rowId = (r: any) => r.id as number;

type Ctl = ReturnType<typeof useCommunicationController>;
type Filter = 'all' | 'awaiting' | 'email' | 'announcement';

/** "2026-10-01 14:05" → locale date/time. */
function when(d?: string, withTime = true) {
  if (!d) return '';
  const t = new Date(String(d).replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) return d;
  return withTime ? t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const toInput = (d?: string) => (d ? String(d).replace(' ', 'T').slice(0, 16) : '');
const fromInput = (v: string) => v.replace('T', ' ');

export function CommunicationPage(props: any) {
  const ctl = useCommunicationController({ communications: props.communications || [], setCommunications: props.setCommunications, refresh: props.refresh, hasScope: props.hasScope });
  const narrow = useIsNarrow();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<number | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ctl.threads.filter((t: any) => {
      if (filter === 'email' && t.root.type !== 'email') return false;
      if (filter === 'announcement' && t.root.type !== 'announcement') return false;
      if (filter === 'awaiting' && t.all[t.all.length - 1].direction === 'inbound') return false;
      if (!q) return true;
      return t.all.some((e: any) => `${e.recipient} ${e.subject} ${e.body}`.toLowerCase().includes(q));
    });
  }, [ctl.threads, query, filter]);
  const active = visible.find((t: any) => t.root.id === (openId ?? ctl.expandedId)) || (!narrow ? visible[0] : null) || null;
  const awaiting = ctl.threads.filter((t: any) => t.all[t.all.length - 1].direction !== 'inbound').length;
  const open = (id: number) => { setOpenId(id); ctl.setExpandedId(id); };
  const roots = useMemo(() => visible.map((t: any) => t.root), [visible]);
  const sel = useSelection(ctl.canManage ? roots : NONE, rowId);
  // Right-click a conversation in the list (V3.5: right-click everywhere).
  useContextMenu('comm-thread', (el) => {
    const id = Number(el.dataset.cmId);
    const t = visible.find((x: any) => x.root.id === id);
    if (!t) return null;
    return [
      { label: 'Open', icon: Mail, action: () => open(id) },
      ...(ctl.canManage ? [
        { label: 'Log their reply', icon: MessageSquareReply, action: () => { open(id); ctl.openReply(t, 'inbound'); } },
        { separator: true },
        { label: 'Delete conversation', icon: Trash2, danger: true, action: () => void ctl.handleDelete(id, true) },
      ] : []),
    ];
  });

  const detail = active && <ThreadDetail thread={active} ctl={ctl} />;

  return (
    <Page>
      <PageHeader
        eyebrow="Communication"
        title="Conversations"
        description={`${ctl.threads.length} ${ctl.threads.length === 1 ? 'thread' : 'threads'} · ${awaiting} waiting on a reply`}
        actions={ctl.canManage && (
          <div className="flex">
            <Button className="rounded-r-none" onClick={() => ctl.setShowAdd(true)}><Plus /> Log message</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button className="rounded-l-none border-l border-accent-ink/20 px-2" aria-label="More ways to log"><ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => ctl.setShowQuickAdd(true)}><Sparkles /> Paste it to Bruno</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => ctl.setShowImport(true)}><FileUp /> Import an email file</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, subjects, text" aria-label="Search conversations" className="pl-9 max-sm:h-11" />
          </div>
          <ToggleGroup type="single" value={filter} onValueChange={(v) => { if (v) setFilter(v as Filter); }} aria-label="Filter" className="flex-wrap">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="awaiting">Awaiting reply</ToggleGroupItem>
            <ToggleGroupItem value="email">Email</ToggleGroupItem>
            <ToggleGroupItem value="announcement">Announcements</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PageHeader>

      {visible.length === 0 ? (
        <EmptyState icon={Mail} title={ctl.threads.length ? 'Nothing matches' : 'No messages logged yet'} description={ctl.threads.length ? 'Try another search or filter.' : 'Log the emails and announcements you send for the team, so everyone can see the history.'} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ul className="space-y-2" aria-label="Conversations">
            {ctl.canManage && (
              <li className="flex items-center">
                <label className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm text-muted-foreground max-sm:min-h-11">
                  <SelectAllCheckbox sel={sel} label="Select all shown conversations" />
                  <span>{sel.count ? `${sel.count} selected` : 'Select all'}</span>
                </label>
              </li>
            )}
            {visible.map((t: any) => {
              const last = t.all[t.all.length - 1];
              const waiting = last.direction !== 'inbound';
              const on = active?.root.id === t.root.id;
              return (
                <li key={t.root.id} data-cm-type="comm-thread" data-cm-id={t.root.id} className="relative">
                  {ctl.canManage && <RowCheckbox sel={sel} id={t.root.id} label={`Select conversation with ${t.root.recipient || 'unknown recipient'}: ${t.root.subject || 'no subject'}`} className="absolute left-3 top-4 z-10" />}
                  <motion.button
                    type="button"
                    layout
                    onClick={() => open(t.root.id)}
                    aria-current={on ? 'true' : undefined}
                    className={cn('w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && !narrow ? 'border-accent/60' : 'border-border', ctl.canManage && 'pl-10', sel.has(t.root.id) && 'ring-1 ring-accent/40')}
                  >
                    <span className="flex items-center gap-2">
                      {t.root.type === 'announcement' ? <Megaphone className="size-4 shrink-0 text-muted-foreground" /> : <Mail className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.root.recipient || 'Unknown recipient'}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{when(t.lastDate, false)}</span>
                    </span>
                    <span className="mt-1 block truncate text-sm">{t.root.subject || '(no subject)'}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{last.body}</span>
                    <span className="mt-2 flex items-center gap-2">
                      {waiting ? <Badge variant="outline" className="gap-1"><Clock className="size-3" /> Awaiting reply</Badge> : <Badge variant="soft" className="gap-1"><ArrowDownLeft className="size-3" /> Replied</Badge>}
                      {t.count > 1 && <span className="text-xs text-muted-foreground">{t.count} entries</span>}
                    </span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
          <BulkBar sel={sel} noun="conversation" actions={[{ label: 'Delete', icon: <Trash2 />, danger: true, run: (ids) => ctl.bulkDeleteThreads(ids.map(Number)) }]} />
          {!narrow && <div className="min-w-0">{detail}</div>}
        </div>
      )}

      {narrow && (
        <Sheet open={!!active && openId != null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
          <SheetContent side="bottom" className="max-h-[90dvh] gap-0 overflow-y-auto p-0">
            <SheetHeader className="sr-only"><SheetTitle>Conversation</SheetTitle><SheetDescription>Entries in this thread</SheetDescription></SheetHeader>
            <div className="p-4">{detail}</div>
          </SheetContent>
        </Sheet>
      )}

      <NewLogSheet ctl={ctl} />
      <ReplyDialog ctl={ctl} />
      <EditDialog ctl={ctl} />
      <Dialog open={!!ctl.askResponded} onOpenChange={(o) => { if (!o) ctl.setAskResponded(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Did they reply?</DialogTitle>
            <DialogDescription>If {ctl.askResponded?.recipient || 'the recipient'} already answered “{ctl.askResponded?.subject}”, log it now.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => ctl.setAskResponded(null)}>Not yet</Button>
            <Button onClick={() => {
              const saved = ctl.askResponded;
              ctl.setAskResponded(null);
              open(saved.id);
              ctl.openReply({ root: { id: saved.id, recipient: saved.recipient, subject: saved.subject, type: saved.type } }, 'inbound');
            }}>Yes, log their reply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ctl.showImport && <ImportEmailDialog onClose={() => ctl.setShowImport(false)} onLogged={() => { ctl.setShowImport(false); props.refresh.communications(); }} onRefresh={() => props.refresh.communications()} />}
      {ctl.showQuickAdd && (
        <QuickAddDialog
          threads={ctl.threads.map((t: any) => ({ id: t.root.id, subject: t.root.subject, recipient: t.root.recipient, date: t.root.date }))}
          onClose={() => ctl.setShowQuickAdd(false)}
          onLogged={() => { ctl.setShowQuickAdd(false); props.refresh.communications(); }}
          onRefresh={() => props.refresh.communications()}
        />
      )}
    </Page>
  );
}

function ThreadDetail({ thread, ctl }: { thread: any; ctl: Ctl }) {
  return (
    <section className="rounded-xl border border-border bg-card" aria-label={`Conversation with ${thread.root.recipient}`}>
      <header className="flex flex-wrap items-start gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{thread.root.type === 'announcement' ? 'Announcement' : 'Email'} · {thread.root.recipient}</p>
          <h2 className="mt-0.5 text-lg font-semibold leading-snug">{thread.root.subject || '(no subject)'}</h2>
        </div>
        {ctl.canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => ctl.openReply(thread, 'inbound')} className="max-sm:h-11"><ArrowDownLeft /> Log their reply</Button>
            <Button size="sm" variant="outline" onClick={() => ctl.openReply(thread, 'outbound')} className="max-sm:h-11"><MessageSquareReply /> Follow up</Button>
          </div>
        )}
      </header>
      <ol className="space-y-4 p-4">
        {thread.all.map((e: any) => {
          const inbound = e.direction === 'inbound';
          const isRoot = e.id === thread.root.id;
          return (
            <motion.li key={e.id} data-cm-type="comm" data-cm-id={e.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
              <div className={cn('group/entry max-w-[90%] rounded-2xl border px-4 py-3', inbound ? 'rounded-bl-md border-info/30 bg-info/5' : 'rounded-br-md border-border bg-muted/40')}>
                <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {inbound ? <ArrowDownLeft className="size-3.5 text-info" /> : <ArrowUpRight className="size-3.5" />}
                  {inbound ? `From ${thread.root.recipient}` : 'You / Team'} · {when(e.date)}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{e.body}</p>
                {ctl.canManage && (
                  <div className="mt-2 flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover/entry:opacity-100 md:group-focus-within/entry:opacity-100">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit entry" className="max-sm:size-11" onClick={() => ctl.openEdit(e)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={isRoot ? 'Delete thread' : 'Delete reply'} className="text-destructive hover:text-destructive max-sm:size-11" onClick={() => void ctl.handleDelete(e.id, isRoot)}><Trash2 /></Button>
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

function NewLogSheet({ ctl }: { ctl: Ctl }) {
  const narrow = useIsNarrow();
  const f = ctl.newComm;
  const set = (p: Partial<typeof f>) => ctl.setNewComm({ ...f, ...p });
  return (
    <Sheet open={ctl.showAdd} onOpenChange={ctl.setShowAdd}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>Log a message</SheetTitle>
          <SheetDescription>Something you sent for the team. Your draft is kept if saving fails.</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void ctl.handleAdd(); }}>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <ToggleGroup type="single" value={f.type} onValueChange={(v) => { if (v) set({ type: v }); }} aria-label="Message type" className="justify-start">
              <ToggleGroupItem value="email"><Mail /> Email</ToggleGroupItem>
              <ToggleGroupItem value="announcement"><Megaphone /> Announcement</ToggleGroupItem>
            </ToggleGroup>
            <div className="grid gap-2"><Label htmlFor="comm-to">To <RequiredMark /></Label><Input id="comm-to" required value={f.recipient} onChange={(e) => set({ recipient: e.target.value })} placeholder="Sponsor, parents, venue…" /></div>
            <div className="grid gap-2"><Label htmlFor="comm-subject">Subject <RequiredMark /></Label><Input id="comm-subject" required value={f.subject} onChange={(e) => set({ subject: e.target.value })} /></div>
            <div className="grid gap-2"><Label htmlFor="comm-date">Sent</Label><Input id="comm-date" type="datetime-local" value={toInput(f.date)} onChange={(e) => set({ date: fromInput(e.target.value) })} /></div>
            <div className="grid gap-2"><Label htmlFor="comm-body">Message</Label><Textarea id="comm-body" value={f.body} onChange={(e) => set({ body: e.target.value })} className="min-h-40" /></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={() => ctl.setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Log message</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ReplyDialog({ ctl }: { ctl: Ctl }) {
  const r = ctl.replyingTo;
  const f = ctl.replyForm;
  const set = (p: Partial<typeof f>) => ctl.setReplyForm({ ...f, ...p });
  const inbound = f.direction === 'inbound';
  return (
    <Dialog open={!!r} onOpenChange={(o) => { if (!o) ctl.setReplyingTo(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{inbound ? `Reply from ${r?.root?.recipient || 'them'}` : 'Follow-up message'}</DialogTitle>
          <DialogDescription>{r?.root?.subject}</DialogDescription>
        </DialogHeader>
        <form id="comm-reply" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void ctl.handleReply(); }}>
          <ToggleGroup type="single" value={f.direction} onValueChange={(v) => { if (v) set({ direction: v }); }} aria-label="Direction" className="justify-start">
            <ToggleGroupItem value="inbound"><ArrowDownLeft /> They replied</ToggleGroupItem>
            <ToggleGroupItem value="outbound"><ArrowUpRight /> We followed up</ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-2"><Label htmlFor="reply-body">Message</Label><Textarea id="reply-body" value={f.body} onChange={(e) => set({ body: e.target.value })} placeholder={inbound ? 'Paste their response…' : 'Write your follow-up…'} className="min-h-32" /></div>
          <div className="grid gap-2"><Label htmlFor="reply-date">When</Label><Input id="reply-date" type="datetime-local" value={toInput(f.date)} onChange={(e) => set({ date: fromInput(e.target.value) })} /></div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => ctl.setReplyingTo(null)}>Cancel</Button>
          <Button type="submit" form="comm-reply" disabled={!f.body.trim()}>Add to thread</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ ctl }: { ctl: Ctl }) {
  const e = ctl.editingEntry;
  const f = ctl.editForm;
  const set = (p: Partial<typeof f>) => ctl.setEditForm({ ...f, ...p });
  const isRoot = e && e.parent_id == null;
  return (
    <Dialog open={!!e} onOpenChange={(o) => { if (!o) ctl.setEditingEntry(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit entry</DialogTitle><DialogDescription>Changes show for everyone.</DialogDescription></DialogHeader>
        <form id="comm-edit" className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void ctl.handleEdit(); }}>
          <ToggleGroup type="single" value={f.direction} onValueChange={(v) => { if (v) set({ direction: v }); }} aria-label="Direction" className="justify-start">
            <ToggleGroupItem value="outbound"><ArrowUpRight /> Sent by us</ToggleGroupItem>
            <ToggleGroupItem value="inbound"><ArrowDownLeft /> Received</ToggleGroupItem>
          </ToggleGroup>
          {isRoot && (
            <>
              <div className="grid gap-2"><Label htmlFor="edit-to">To <RequiredMark /></Label><Input id="edit-to" required value={f.recipient} onChange={(ev) => set({ recipient: ev.target.value })} /></div>
              <div className="grid gap-2"><Label htmlFor="edit-subject">Subject <RequiredMark /></Label><Input id="edit-subject" required value={f.subject} onChange={(ev) => set({ subject: ev.target.value })} /></div>
            </>
          )}
          <div className="grid gap-2"><Label htmlFor="edit-date">When</Label><Input id="edit-date" type="datetime-local" value={toInput(f.date)} onChange={(ev) => set({ date: fromInput(ev.target.value) })} /></div>
          <div className="grid gap-2"><Label htmlFor="edit-body">Message</Label><Textarea id="edit-body" value={f.body} onChange={(ev) => set({ body: ev.target.value })} className="min-h-32" /></div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => ctl.setEditingEntry(null)}>Cancel</Button>
          <Button type="submit" form="comm-edit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
