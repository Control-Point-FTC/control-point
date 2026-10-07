// One message in the Modern conversation: grouped under the sender (avatar
// and name on the first of a run), reply quote, forwarded label, text with
// mention pills + links, image / file, link preview, reactions and a hover
// (or tap) action bar.
import { memo, useEffect, useState } from 'react';
import { Copy, CornerUpLeft, Download, FileText, Forward, ImageOff, Pencil, SmilePlus, Trash2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button, Textarea, Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui-kit';
import { apiFetch, assetUrl } from '../../../services/api';
import { EmojiPicker, ReactionBar } from './Reactions';
import { extractFirstUrl, formatFileSize, isImageFile, renderMessageText } from '../../../components/chat/chatFormat';
import { PresenceAvatar } from '../people/MembersTab';

function ChatImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p className="flex max-w-xs items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <ImageOff className="size-4 shrink-0" /> This image is no longer available — ask the sender to upload it again.
      </p>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block w-fit">
      <img src={src} alt={alt} onError={() => setFailed(true)} className="max-h-72 max-w-full rounded-lg border border-border object-cover sm:max-w-sm" />
    </a>
  );
}

function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setDismissed(false);
    apiFetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && (d.title || d.description || d.image)) setPreview(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  if (dismissed || !preview) return null;
  return (
    <div className="mt-2 flex max-w-md overflow-hidden rounded-lg border border-border bg-card">
      <span className="w-1 shrink-0 bg-accent/60" />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start gap-2">
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 flex-1 break-all text-sm font-medium hover:underline">{preview.title || preview.site || url}</a>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss preview" className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
        </div>
        {preview.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview.description}</p>}
        {preview.site && <p className="mt-1 text-xs text-muted-foreground">{preview.site}</p>}
      </div>
      {preview.image && <img src={preview.image} alt="" loading="lazy" className="hidden w-24 object-cover sm:block" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
    </div>
  );
}

function Action({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} data-cm-action={danger ? 'danger' : ''} onClick={onClick} className={cn('max-sm:size-11', danger && 'text-destructive hover:text-destructive')}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const MessageRow = memo(function MessageRow({ msg, sender, grouped, mine, canDelete, flash, active, pickerOpen, currentUserId, memberNames, onRef, onActivate, onReply, onForward, onCopy, onDelete, onEdit, onOpenPicker, onClosePicker, onPick, onReactionsChange, onJumpTo }: {
  msg: any; sender: any; grouped: boolean; mine: boolean; canDelete: boolean; flash: boolean; active: boolean; pickerOpen: boolean;
  currentUserId?: number; memberNames: Record<number, string>;
  onRef: (id: number, el: HTMLDivElement | null) => void; onActivate: (id: number) => void;
  onReply: (m: any) => void; onForward: (m: any) => void; onCopy: (m: any) => void; onDelete: (id: number) => void;
  /** Edit your own message; resolves true when saved. */
  onEdit?: (id: number, text: string) => Promise<boolean>;
  onOpenPicker: (id: number) => void; onClosePicker: () => void; onPick: (id: number, emoji: string) => void;
  onReactionsChange: (id: number, r: any[]) => void; onJumpTo: (id: number) => void;
}) {
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const fileUrl = msg.file_path ? assetUrl(msg.file_path) : null;
  const url = msg.content ? extractFirstUrl(msg.content) : null;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const startEdit = () => { setDraft(msg.content || ''); setEditing(true); };
  // One save at a time: the editor locks until it answers.
  const save = async () => {
    if (!onEdit || saving) return;
    if (draft.trim() === (msg.content || '').trim()) { setEditing(false); return; }
    setSaving(true);
    try { if (await onEdit(msg.id, draft)) setEditing(false); } finally { setSaving(false); }
  };
  return (
    <div
      ref={(el) => onRef(msg.id, el)}
      // Right-click / menu key: the hover toolbar's actions as a menu.
      data-cm-row data-cm-label="Message actions"
      onClick={() => onActivate(msg.id)}
      className={cn(
        'group/msg relative flex gap-3 rounded-lg px-3 transition-colors hover:bg-muted/40 focus-within:bg-muted/40',
        grouped ? 'py-0.5' : 'mt-3 py-1.5',
        flash && 'bg-accent/10',
        msg.pending && 'opacity-60',
        active && 'bg-muted/40',
      )}
    >
      <div className="w-9 shrink-0">
        {grouped
          ? <span className="block pt-1 text-right text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover/msg:opacity-100">{time}</span>
          : <PresenceAvatar member={sender || { name: msg.sender_name }} />}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{msg.sender_name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
          </p>
        )}
        {msg.reply_to_id && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onJumpTo(msg.reply_to_id); }} className="mb-1 flex max-w-full items-center gap-1.5 truncate text-left text-xs text-muted-foreground hover:text-foreground">
            <CornerUpLeft className="size-3 shrink-0" />
            {msg.reply_content != null
              ? <><span className="font-medium">{msg.reply_sender_name}</span><span className="truncate">{msg.reply_content}</span></>
              : <span className="italic">Original message was deleted</span>}
          </button>
        )}
        {msg.is_forwarded ? <p className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Forward className="size-3" /> Forwarded{msg.forwarded_from ? ` · ${msg.forwarded_from}` : ''}</p> : null}
        {editing ? (
          <div className="mt-1 grid gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Textarea
              autoFocus value={draft} rows={Math.min(8, Math.max(2, draft.split('\n').length))} aria-label="Edit message"
              maxLength={4000} readOnly={saving} aria-busy={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Enter to <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => void save()}>save</button>
              {' '}· Esc to <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => setEditing(false)}>cancel</button>
            </p>
          </div>
        ) : msg.content && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {renderMessageText(msg.content, { mention: 'rounded bg-accent/15 px-1 font-medium text-accent', link: 'break-all text-info underline-offset-2 hover:underline' })}
            {msg.edited_at && <span className="ml-1 text-[11px] text-muted-foreground" title={new Date(msg.edited_at).toLocaleString()}>(edited)</span>}
          </p>
        )}
        {msg.file_path && (
          <div className="mt-1.5">
            {isImageFile(msg.file_path)
              ? <ChatImage src={fileUrl!} alt={msg.file_name || 'Attachment'} />
              : (
                <a href={fileUrl!} target="_blank" rel="noopener noreferrer" className="flex max-w-sm items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/50">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{msg.file_name || 'File'}</span>
                    <span className="block text-xs text-muted-foreground">{formatFileSize(msg.file_size)}</span>
                  </span>
                  <Download className="size-4 text-muted-foreground" />
                </a>
              )}
          </div>
        )}
        {url && <LinkPreview url={url} />}
        <ReactionBar messageId={msg.id} reactions={msg.reactions || []} memberId={currentUserId} onReactionsChange={onReactionsChange} memberNames={memberNames} onAdd={() => onOpenPicker(msg.id)} />
        {pickerOpen && (
          <div className="relative z-20 mt-1" onClick={(e) => e.stopPropagation()}>
            <EmojiPicker onPick={(emoji: string) => onPick(msg.id, emoji)} onClose={onClosePicker} />
          </div>
        )}
      </div>
      {!msg.pending && (
        <div
          className={cn(
            'absolute -top-4 right-3 z-10 flex items-center rounded-lg border border-border bg-popover p-0.5 shadow-sm transition-opacity',
            active ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Action label="Add reaction" onClick={() => onOpenPicker(msg.id)}><SmilePlus /></Action>
          <Action label="Reply" onClick={() => onReply(msg)}><CornerUpLeft /></Action>
          <Action label="Forward" onClick={() => onForward(msg)}><Forward /></Action>
          {msg.content && <Action label="Copy text" onClick={() => onCopy(msg)}><Copy /></Action>}
          {mine && msg.content && onEdit && !editing && <Action label="Edit message" onClick={startEdit}><Pencil /></Action>}
          {(mine || canDelete) && <Action label="Delete message" onClick={() => onDelete(msg.id)} danger><Trash2 /></Action>}
        </div>
      )}
    </div>
  );
});
