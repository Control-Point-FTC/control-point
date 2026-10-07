// Channel navigation for Modern Messages: workspace switcher, categories
// (collapsible), channels with an admin menu (rename, move, admin-only
// posting, delete), new channel / category forms, and the voice channels.
import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, FolderPlus, Hash, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Input,
} from '../../../components/ui-kit';
import { VoiceChannels } from './VoiceChannels';
import type { useChatController } from '../../../components/chat/useChatController';

type Ctl = ReturnType<typeof useChatController>;

export function ChannelSidebar({ ctl, channels, categories, activeChannelId, onSelect, isAdmin, teams, activeTeamName, currentTeamId, onSwitchTeam, unreadByChannel, handleDeleteChannel, handleDeleteCategory, handleMoveChannel }: {
  ctl: Ctl; channels: any[]; categories: any[]; activeChannelId: number | null; onSelect: (id: number) => void; isAdmin: boolean;
  teams: any[]; activeTeamName?: string; currentTeamId?: number; onSwitchTeam?: (id: number) => void; unreadByChannel?: Record<number, number>;
  handleDeleteChannel: (id: number) => any; handleDeleteCategory: (id: number, name: string) => any; handleMoveChannel: (id: number, categoryId: number | null) => any;
}) {
  const [newCatOpen, setNewCatOpen] = useState(false);
  const cats = [...(categories || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  const catIds = new Set(cats.map((c) => c.id));
  const byCat = new Map<number, any[]>();
  const ungrouped: any[] = [];
  for (const c of channels || []) {
    if (c.category_id != null && catIds.has(c.category_id)) {
      if (!byCat.has(c.category_id)) byCat.set(c.category_id, []);
      byCat.get(c.category_id)!.push(c);
    } else ungrouped.push(c);
  }

  const newChannelForm = (where: number | 'uncat') => ctl.creatingIn === where && (
    <form className="mx-2 mb-2 space-y-2 rounded-lg border border-border bg-card p-2" onSubmit={(e) => { e.preventDefault(); void ctl.handleCreateChannelSubmit(); }}>
      <Input autoFocus value={ctl.newChannelName} onChange={(e) => ctl.setNewChannelName(e.target.value)} placeholder="channel-name" maxLength={40} aria-label="Channel name" className="h-9" />
      <Input value={ctl.newChannelTopic} onChange={(e) => ctl.setNewChannelTopic(e.target.value)} placeholder="Topic (optional)" maxLength={140} aria-label="Channel topic" className="h-9" />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => { ctl.setCreatingIn(null); ctl.setCreatingChannel(false); }}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!ctl.newChannelName.trim()}>Create</Button>
      </div>
    </form>
  );

  const channelRow = (c: any) => {
    const on = c.id === activeChannelId;
    const unread = unreadByChannel?.[c.id] ?? 0;
    if (ctl.renamingChannel === c.id) {
      return (
        <form key={c.id} className="flex gap-1.5 px-2 py-1" onSubmit={(e) => { e.preventDefault(); void ctl.handleRenameChannelSubmit(); }}>
          <Input autoFocus value={ctl.renameChannelName} onChange={(e) => ctl.setRenameChannelName(e.target.value)} aria-label="New channel name" className="h-8" onKeyDown={(e) => { if (e.key === 'Escape') ctl.setRenamingChannel(null); }} />
          <Button type="submit" size="icon-sm" aria-label="Save name"><Check /></Button>
        </form>
      );
    }
    return (
      <div
        key={c.id}
        draggable={isAdmin}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(c.id)); ctl.setDragChannelId(c.id); }}
        onDragEnd={() => { ctl.setDragChannelId(null); ctl.setDragOverTarget(null); }}
        className={cn('group/ch relative flex items-center rounded-md', on ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}
      >
        <button type="button" onClick={() => onSelect(c.id)} aria-current={on ? 'page' : undefined} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm max-sm:min-h-11">
          <Hash className="size-4 shrink-0 opacity-70" />
          <span className={cn('truncate', unread > 0 && 'font-semibold text-foreground')}>{c.name}</span>
          {c.post_restricted ? <Lock className="size-3 shrink-0 opacity-60" aria-label="Admin-only posting" /> : null}
          {unread > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
        </button>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Options for #${c.name}`} className="mr-0.5 opacity-100 md:opacity-0 md:group-hover/ch:opacity-100 md:focus-visible:opacity-100 max-sm:size-11"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>#{c.name}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => { ctl.setRenamingChannel(c.id); ctl.setRenameChannelName(c.name); }}><Pencil /> Rename</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {cats.map((cat) => (
                    <DropdownMenuItem key={cat.id} disabled={c.category_id === cat.id} onSelect={() => void handleMoveChannel(c.id, cat.id)}>{cat.name}</DropdownMenuItem>
                  ))}
                  <DropdownMenuItem disabled={c.category_id == null} onSelect={() => void handleMoveChannel(c.id, null)}>No category</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => void ctl.togglePostRestricted(c)}><Lock /> {c.post_restricted ? 'Open posting to everyone' : 'Admin-only posting'}</DropdownMenuItem>
              {c.name !== 'general' && (<><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => void handleDeleteChannel(c.id)}><Trash2 /> Delete channel</DropdownMenuItem></>)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const dropProps = (key: string, catId: number | null) => isAdmin ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); ctl.setDragOverTarget(key); },
    onDragLeave: () => ctl.setDragOverTarget(null),
    onDrop: (e: React.DragEvent) => void ctl.handleDropOnCategory(e, catId),
  } : {};

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-14 items-center gap-2 border-b border-border px-3">
        {(teams || []).length > 1 && onSwitchTeam ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="min-w-0 flex-1 justify-between px-2 font-semibold"><span className="truncate">{activeTeamName || 'My team'}</span><ChevronDown /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
              {teams.map((t) => <DropdownMenuItem key={t.id} onSelect={() => onSwitchTeam(t.id)}>{t.name}{t.id === currentTeamId && <Check className="ml-auto text-accent" />}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : <p className="flex-1 truncate px-2 font-semibold">{activeTeamName || 'My team'}</p>}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="New channel or category"><Plus /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { ctl.setCreatingIn('uncat'); ctl.setCreatingChannel(true); }}><Hash /> New channel</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNewCatOpen(true)}><FolderPlus /> New category</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <nav aria-label="Channels" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {newCatOpen && (
          <form className="mx-2 mb-3 flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (await ctl.handleCreateCategorySubmit()) setNewCatOpen(false); }}>
            <Input autoFocus value={ctl.newCategoryName} onChange={(e) => ctl.setNewCategoryName(e.target.value)} placeholder="Category name" aria-label="Category name" className="h-9" onKeyDown={(e) => { if (e.key === 'Escape') setNewCatOpen(false); }} />
            <Button type="submit" size="sm" disabled={!ctl.newCategoryName.trim()}>Add</Button>
          </form>
        )}
        <div {...dropProps('uncat', null)} className={cn('mb-2 space-y-0.5 rounded-md', ctl.dragOverTarget === 'uncat' && 'bg-accent/10')}>
          {newChannelForm('uncat')}
          {ungrouped.map(channelRow)}
        </div>
        {cats.map((cat) => {
          const collapsed = ctl.collapsedCats.has(cat.id);
          const list = byCat.get(cat.id) || [];
          return (
            <section key={cat.id} className="mb-2" {...dropProps(`cat:${cat.id}`, cat.id)}>
              <div className={cn('group/cat flex items-center rounded-md', ctl.dragOverTarget === `cat:${cat.id}` && 'bg-accent/10')}>
                {ctl.renamingCat === cat.id ? (
                  <form className="flex flex-1 gap-1.5 px-1 py-1" onSubmit={(e) => { e.preventDefault(); void ctl.handleRenameCategorySubmit(); }}>
                    <Input autoFocus value={ctl.renameCatName} onChange={(e) => ctl.setRenameCatName(e.target.value)} aria-label="New category name" className="h-8" onKeyDown={(e) => { if (e.key === 'Escape') ctl.setRenamingCat(null); }} />
                    <Button type="submit" size="icon-sm" aria-label="Save category name"><Check /></Button>
                  </form>
                ) : (
                  <button type="button" onClick={() => ctl.toggleCat(cat.id)} aria-expanded={!collapsed} className="flex min-h-8 flex-1 items-center gap-1 px-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground max-sm:min-h-11">
                    {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    <span className="truncate">{cat.name}</span>
                  </button>
                )}
                {isAdmin && ctl.renamingCat !== cat.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Options for ${cat.name}`} className="opacity-100 md:opacity-0 md:group-hover/cat:opacity-100 md:focus-visible:opacity-100 max-sm:size-11"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => { ctl.setCreatingIn(cat.id); ctl.setCreatingChannel(true); }}><Plus /> New channel here</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { ctl.setRenamingCat(cat.id); ctl.setRenameCatName(cat.name); }}><Pencil /> Rename category</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => void handleDeleteCategory(cat.id, cat.name)}><Trash2 /> Delete category</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {/* The new-channel form shows even on a collapsed category. */}
              {newChannelForm(cat.id)}
              {!collapsed && <div className="mt-0.5 space-y-0.5">{list.map(channelRow)}</div>}
            </section>
          );
        })}
        <div className="mt-4 border-t border-border pt-3"><VoiceChannels /></div>
      </nav>
    </div>
  );
}
