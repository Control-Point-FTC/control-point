// Modern Messages (phase 6c). Rebuilt on the kit over the shared
// useChatController (same socket protocol, upload, mentions, reply/forward,
// reactions, paging and admin channel actions as Legacy ChatView).
// Three panes: channels · conversation · people (sheets on small screens).
import { useLayoutEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, CornerUpLeft, Hash, Lock, Menu, Paperclip, Phone, Users, Video, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, TooltipProvider,
} from '../../../components/ui-kit';
import { PRESENCE_META } from '../../../components/presence';
import { useChatController } from '../../../components/chat/useChatController';
import { formatDayDivider } from '../../../components/chat/chatFormat';
import { PresenceAvatar } from '../people/MembersTab';
import { ChannelSidebar } from './ChannelSidebar';
import { MessageRow } from './MessageRow';

const GROUP_MS = 5 * 60 * 1000;

export function MessagesPage(props: any) {
  const {
    messages, setMessages, msgCache, msgExhausted, members = [], currentUser, socket, channels = [], setChannels, activeChannelId, setActiveChannelId,
    handleCreateChannel, handleDeleteChannel, isAdmin, teams = [], activeTeamName, onSwitchTeam, chatCategories = [], handleCreateCategory,
    handleRenameCategory, handleDeleteCategory, handleMoveChannel, memberMenuItems,
  } = props;
  const ctl = useChatController({
    messages, setMessages, msgCache, msgExhausted, members, currentUser, socket, channels, setChannels, activeChannelId, setActiveChannelId,
    isAdmin, handleCreateChannel, handleCreateCategory, handleRenameCategory, handleMoveChannel, memberMenuItems,
  });
  // The controller owns the phone channel sheet (it closes it after a channel is created).
  const channelsOpen = ctl.showChannelsMobile;
  const setChannelsOpen = ctl.setShowChannelsMobile;
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [showPeople, setShowPeople] = useState(true);
  const memberById = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);
  const memberNames = useMemo(() => Object.fromEntries(members.map((m: any) => [m.id, m.name])), [members]);
  const ch = ctl.activeChannel;
  // Fit the composer to its text whenever it changes: typing, a send that
  // clears it, or a restored multiline draft on mount / channel switch.
  useLayoutEffect(() => {
    const el = ctl.composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [ctl.content, ctl.composerRef, ch?.id]);
  const list = ctl.visibleMessages;

  const select = (id: number) => { setActiveChannelId(id); setChannelsOpen(false); };
  const sidebar = (
    <ChannelSidebar
      ctl={ctl} channels={channels} categories={chatCategories} activeChannelId={ch?.id ?? null} onSelect={select} isAdmin={isAdmin}
      teams={teams} activeTeamName={activeTeamName} currentTeamId={currentUser?.team_id} onSwitchTeam={onSwitchTeam}
      handleDeleteChannel={handleDeleteChannel} handleDeleteCategory={handleDeleteCategory} handleMoveChannel={handleMoveChannel}
    />
  );
  const online = members.filter((m: any) => ['online', 'idle', 'dnd'].includes(m.presence));
  const offline = members.filter((m: any) => !online.includes(m));
  const people = (
    <div className="h-full overflow-y-auto px-2 py-3">
      {[['Online', online], ['Offline', offline]].map(([label, group]: any) => group.length > 0 && (
        <section key={label} className="mb-4">
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{label} — {group.length}</p>
          <ul className="space-y-0.5">
            {group.map((m: any) => (
              <li key={m.id} data-cm-type="member-chat" data-cm-id={m.id} className="group/p flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                <PresenceAvatar member={m} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', label === 'Offline' && 'text-muted-foreground')}>{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{PRESENCE_META[m.presence]?.label || 'Offline'}</span>
                </span>
                {m.id !== currentUser?.id && (
                  <span className="flex opacity-100 md:opacity-0 md:group-hover/p:opacity-100 md:group-focus-within/p:opacity-100">
                    <Button variant="ghost" size="icon-sm" aria-label={`Voice call ${m.name}`} className="max-sm:size-11" onClick={() => ctl.voice.startCall([m.id], 'audio')}><Phone /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Video call ${m.name}`} className="max-sm:size-11" onClick={() => ctl.voice.startCall([m.id], 'video')}><Video /></Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  // Group consecutive messages from the same sender (within 5 minutes) and
  // insert a day divider whenever the date changes.
  // Each day is its own section, so its sticky pill stays pinned while that
  // day's messages scroll past.
  const days: { key: string; label: string; rows: { key: string; node: React.ReactNode }[] }[] = [];
  let rows: { key: string; node: React.ReactNode }[] = [];
  let prev: any = null;
  for (const msg of list) {
    const day = msg.timestamp ? new Date(msg.timestamp).toDateString() : '';
    if (!prev || (prev.timestamp && new Date(prev.timestamp).toDateString() !== day)) {
      rows = [];
      // Stable per channel + day: loading older messages or deleting the
      // first one must not remount the day (and reset its rows).
      days.push({ key: `d-${ch?.id ?? 0}-${day}`, label: msg.timestamp ? formatDayDivider(msg.timestamp) : '', rows });
      prev = null;
    }
    const grouped = !!prev && prev.sender_id === msg.sender_id && !msg.reply_to_id && !msg.is_forwarded
      && Math.abs(new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()) < GROUP_MS;
    rows.push({ key: String(msg.id), node: (
      <MessageRow
        msg={msg} sender={memberById.get(msg.sender_id)} grouped={grouped} mine={msg.sender_id === currentUser?.id} canDelete={isAdmin}
        flash={ctl.flashId === msg.id} active={ctl.activeMsgId === msg.id} pickerOpen={ctl.reactPickerFor === msg.id}
        currentUserId={currentUser?.id} memberNames={memberNames}
        onRef={(id, el) => { if (el) ctl.msgRefs.current.set(id, el); else ctl.msgRefs.current.delete(id); }}
        onActivate={(id) => { if (ctl.isTouchDevice) ctl.setActiveMsgId((cur: number | null) => (cur === id ? null : id)); }}
        onReply={ctl.startReply} onForward={ctl.setForwardMsg} onCopy={ctl.copyMessageText} onDelete={ctl.handleDeleteMessage} onEdit={ctl.handleEditMessage}
        onOpenPicker={(id) => ctl.setReactPickerFor(id)} onClosePicker={() => ctl.setReactPickerFor(null)} onPick={ctl.handlePickReaction}
        onReactionsChange={ctl.handleReactionsChange} onJumpTo={ctl.scrollToMessage}
      />
    ) });
    prev = msg;
  }
  const canLoadOlder = !!ch && list.length >= 100 && !msgExhausted.current.get(ch.id);
  const mentions = ctl.showMentions ? ctl.filteredMentions.slice(0, 6) : [];
  const pickMention = (m: any) => {
    const parts = ctl.content.split(' ');
    parts.pop();
    ctl.setContent([...parts, `@${m.name} `].join(' '));
    ctl.setShowMentions(false);
    ctl.composerRef.current?.focus();
  };

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card/40 md:block">{sidebar}</aside>

        <section
          className="relative flex min-w-0 flex-1 flex-col"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); ctl.setDragging(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) ctl.setDragging(false); }}
          onDrop={ctl.handleDrop}
        >
          <header className="flex min-h-14 items-center gap-2 border-b border-border px-3 sm:px-4">
            <Button variant="ghost" size="icon" className="md:hidden max-sm:size-11" aria-label="Channels" onClick={() => setChannelsOpen(true)}><Menu /></Button>
            <Hash className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">{ch?.name || 'general'}{ch?.post_restricted ? <Lock className="size-3.5 text-muted-foreground" aria-label="Admin-only posting" /> : null}</p>
              {ch?.topic && <p className="truncate text-xs text-muted-foreground">{ch.topic}</p>}
            </div>
            <Button variant={showPeople ? 'secondary' : 'ghost'} size="icon" aria-label="Show people" aria-pressed={showPeople} className="hidden xl:inline-flex" onClick={() => setShowPeople((v) => !v)}><Users /></Button>
            <Button variant="ghost" size="icon" aria-label="People" className="xl:hidden max-sm:size-11" onClick={() => setPeopleOpen(true)}><Users /></Button>
          </header>

          <div ref={ctl.scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 sm:px-3">
            {canLoadOlder && (
              <div className="flex justify-center py-3">
                <Button variant="ghost" size="sm" onClick={() => void ctl.loadOlderMessages()} disabled={ctl.loadingOlder}>{ctl.loadingOlder ? 'Loading…' : 'Load older messages'}</Button>
              </div>
            )}
            {list.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted"><Hash className="size-6 text-muted-foreground" /></span>
                <p className="font-display text-xl font-semibold">Welcome to #{ch?.name || 'general'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{ch?.topic || 'This is the start of the channel.'}</p>
              </motion.div>
            ) : days.map((d) => (
              <section key={d.key} aria-label={d.label}>
                <div className="sticky top-0 z-10 my-3 flex justify-center" role="separator">
                  <span className="rounded-full border border-border bg-background/90 px-3 py-0.5 text-xs text-muted-foreground backdrop-blur">{d.label}</span>
                </div>
                {d.rows.map((r) => <div key={r.key}>{r.node}</div>)}
              </section>
            ))}
          </div>

          {ctl.dragging && (
            <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-background/80 text-sm font-medium">Drop to attach</div>
          )}

          <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
            {!ctl.canPostInChannel ? (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"><Lock className="size-4" /> Only admins can post in #{ch?.name}.</p>
            ) : (
              <div className="relative rounded-2xl border border-border bg-card shadow-sm focus-within:border-ring/60">
                {mentions.length > 0 && (
                  <ul role="listbox" aria-label="Mention suggestions" className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
                    {mentions.map((m: any, i: number) => (
                      <li key={m.id}>
                        <button type="button" role="option" aria-selected={i === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m)} className={cn('flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted', i === 0 && 'bg-muted/60')}>
                          {m.special ? <span className="flex size-6 items-center justify-center rounded-full bg-accent/15 text-xs text-accent">@</span> : <PresenceAvatar member={m} className="size-6" />}
                          <span className="font-medium">{m.special ? `@${m.name}` : m.name}</span>
                          {m.special && <span className="truncate text-xs text-muted-foreground">{m.special}</span>}
                        </button>
                      </li>
                    ))}
                    <li className="px-2 pt-1 text-[11px] text-muted-foreground">Tab to insert</li>
                  </ul>
                )}
                {ctl.replyTo && (
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                    <CornerUpLeft className="size-3.5" /> Replying to <span className="font-medium text-foreground">{ctl.replyTo.sender_name}</span>
                    <span className="truncate">{ctl.replyTo.content}</span>
                    <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Cancel reply" onClick={() => ctl.setReplyTo(null)}><X /></Button>
                  </div>
                )}
                {ctl.pendingFile && (
                  <div className="flex items-center gap-3 border-b border-border px-3 py-2">
                    {ctl.pendingPreview ? <img src={ctl.pendingPreview} alt="" className="size-12 rounded-md object-cover" /> : <Paperclip className="size-4 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate text-sm">{ctl.pendingFile.name}</span>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove attachment" onClick={ctl.clearPending}><X /></Button>
                  </div>
                )}
                <div className="flex items-end gap-1 p-2">
                  <input ref={ctl.fileInputRef} type="file" className="hidden" onChange={ctl.handleFileUpload} aria-label="Attach a file" />
                  <Button variant="ghost" size="icon" aria-label="Attach a file" className="shrink-0 text-muted-foreground max-sm:size-11" onClick={() => ctl.fileInputRef.current?.click()} disabled={ctl.uploading}><Paperclip /></Button>
                  <textarea
                    ref={ctl.composerRef}
                    rows={1}
                    value={ctl.content}
                    onChange={ctl.onContentChange}
                    onKeyDown={ctl.handleKeyDown}
                    onPaste={ctl.handlePaste}
                    placeholder={`Message #${ch?.name || 'general'}`}
                    aria-label={`Message #${ch?.name || 'general'}`}
                    className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                  />
                  <Button size="icon" className="shrink-0 rounded-full max-sm:size-11" aria-label="Send message" onClick={() => void ctl.handleSend()} disabled={ctl.uploading || (!ctl.content.trim() && !ctl.pendingFile)}><ArrowUp /></Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {showPeople && <aside className="hidden w-60 shrink-0 border-l border-border xl:block" aria-label="People">{people}</aside>}
      </div>

      <Sheet open={channelsOpen} onOpenChange={setChannelsOpen}>
        <SheetContent side="left" className="w-80 gap-0 p-0">
          <SheetHeader className="sr-only"><SheetTitle>Channels</SheetTitle><SheetDescription>Text and voice channels</SheetDescription></SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>
      <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
        <SheetContent side="right" className="w-80 gap-0 p-0">
          <SheetHeader className="border-b border-border px-4 py-3"><SheetTitle>People</SheetTitle><SheetDescription className="sr-only">Team members and presence</SheetDescription></SheetHeader>
          {people}
        </SheetContent>
      </Sheet>

      <Dialog open={!!ctl.forwardMsg} onOpenChange={(o) => { if (!o) ctl.setForwardMsg(null); }}>
        <DialogContent className="gap-3 p-0 sm:max-w-sm">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Forward message</DialogTitle>
            <DialogDescription className="line-clamp-2">{ctl.forwardMsg?.content || ctl.forwardMsg?.file_name}</DialogDescription>
          </DialogHeader>
          <Command className="border-t border-border">
            <CommandInput placeholder="Find a channel…" />
            <CommandList className="max-h-72">
              <CommandEmpty>No channels.</CommandEmpty>
              <CommandGroup>
                {channels.map((c: any) => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => { void ctl.handleForward(c.id); }} className="min-h-11">
                    <Hash className="size-4" /> {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

