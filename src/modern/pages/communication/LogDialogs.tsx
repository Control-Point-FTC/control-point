// Modern Communication log dialogs (phase 10c): Bruno quick add and saved
// email import, over the shared useBrunoQuickAdd / useEmailImport (same
// parsing, Bruno prompt, request and validation as Classic). Both end in the
// same review form: recipient, date, subject, message, who sent it (a
// segmented control), type, and for quick add the thread (a searchable
// picker). Closing discards the draft; a look switch keeps it.
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronsUpDown, FileText, Loader2, Mail, Sparkles, Upload } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, Input, Label, Popover, PopoverContent, PopoverTrigger, Textarea, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { clearQuickAddDrafts, useBrunoQuickAdd, type QuickAddThread } from '../../../components/communication/useBrunoQuickAdd';
import { clearEmailImportDrafts, useEmailImport } from '../../../components/communication/useEmailImport';

const step = { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { duration: 0.2 } };

interface Fields {
  recipient: string; setRecipient: (v: string) => void;
  date: string; setDate: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
  body: string; setBody: (v: string) => void;
  type: string; setType: (v: string) => void;
  direction: 'inbound' | 'outbound'; setDirection: (v: 'inbound' | 'outbound') => void;
}

function ReviewFields({ f, extra }: { f: Fields; extra?: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor="log-recipient">Recipient</Label><Input id="log-recipient" value={f.recipient} onChange={(e) => f.setRecipient(e.target.value)} placeholder="Who is this with?" className="h-11" /></div>
        <div className="grid gap-2"><Label htmlFor="log-date">Date</Label><Input id="log-date" value={f.date} onChange={(e) => f.setDate(e.target.value)} placeholder="YYYY-MM-DD HH:mm" className="h-11" /></div>
      </div>
      <div className="grid gap-2"><Label htmlFor="log-subject">Subject</Label><Input id="log-subject" value={f.subject} onChange={(e) => f.setSubject(e.target.value)} placeholder="Subject" className="h-11" /></div>
      <div className="grid gap-2"><Label htmlFor="log-body">Message</Label><Textarea id="log-body" rows={5} value={f.body} onChange={(e) => f.setBody(e.target.value)} placeholder="Email content…" /></div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label id="log-direction">Who sent it</Label>
          <ToggleGroup type="single" value={f.direction} onValueChange={(v) => { if (v) f.setDirection(v as 'inbound' | 'outbound'); }} aria-labelledby="log-direction">
            <ToggleGroupItem value="outbound" className="max-sm:h-11"><ArrowUpRight /> We did</ToggleGroupItem>
            <ToggleGroupItem value="inbound" className="max-sm:h-11"><ArrowDownLeft /> They did</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid gap-2">
          <Label id="log-type">Type</Label>
          <ToggleGroup type="single" value={f.type} onValueChange={(v) => { if (v) f.setType(v); }} aria-labelledby="log-type">
            <ToggleGroupItem value="email" className="max-sm:h-11">Email</ToggleGroupItem>
            <ToggleGroupItem value="announcement" className="max-sm:h-11">Announcement</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {extra}
      </div>
    </div>
  );
}

function ThreadPicker({ threads, value, onChange }: { threads: QuickAddThread[]; value: number | null; onChange: (id: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = threads.find((t) => t.id === value);
  // Search every thread, then cap what's shown (like Classic).
  const q = query.trim().toLowerCase();
  const matches = (q ? threads.filter((t) => t.subject.toLowerCase().includes(q) || t.recipient.toLowerCase().includes(q)) : threads).slice(0, 100);
  return (
    <div className="grid min-w-0 flex-1 gap-2">
      <Label id="log-thread">Thread</Label>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} aria-labelledby="log-thread" className="h-11 justify-between font-normal sm:h-10">
            <span className="truncate">{selected ? selected.subject : 'New thread'}</span><ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search threads…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No threads match.</CommandEmpty>
              <CommandGroup>
                {!q && <CommandItem value="__new" onSelect={() => { onChange(null); setOpen(false); }}><Check className={cn(value == null ? 'opacity-100' : 'opacity-0')} /> New thread</CommandItem>}
                {matches.map((t) => (
                  <CommandItem key={t.id} value={String(t.id)} onSelect={() => { onChange(t.id); setOpen(false); setQuery(''); }}>
                    <Check className={cn(value === t.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1"><span className="block truncate">{t.subject}</span><span className="block truncate text-xs text-muted-foreground">{t.recipient} · {t.date}</span></span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null;
}

// ---------------------------------------------------------------------------

export function QuickAddDialog({ threads, onClose, onLogged, onRefresh }: { threads: QuickAddThread[]; onClose: () => void; onLogged: () => void; onRefresh?: () => void }) {
  const q = useBrunoQuickAdd({ threads, onLogged, onRefresh });
  const close = () => { clearQuickAddDrafts(); onClose(); };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Bruno quick add</DialogTitle>
          <DialogDescription>Paste an email: a new message, a reply or a follow-up. Bruno fills in the contact, subject, direction and thread; you check it before it's logged.</DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait" initial={false}>
          {!q.showFields ? (
            <motion.div key="paste" {...step} className="grid gap-3">
              <Label htmlFor="quickadd-paste" className="sr-only">Email to parse</Label>
              <Textarea id="quickadd-paste" rows={10} value={q.paste} onChange={(e) => q.setPaste(e.target.value)} className="min-h-44 font-mono text-xs"
                placeholder={'Paste the email here, headers and all…\n\nFrom: sponsors@polymaker.com\nSubject: Re: Filament sponsorship'} />
              <ErrorLine error={q.error} />
              <Button onClick={() => void q.handleParse()} disabled={q.aiBusy || !q.paste.trim()} className="h-11">
                {q.aiBusy ? <><Loader2 className="animate-spin" /> Bruno is reading…</> : <><Sparkles /> Bruno</>}
              </Button>
              <Button variant="ghost" onClick={() => { q.setManual(true); q.setError(null); }} disabled={q.aiBusy} className="h-11">Fill in the fields myself</Button>
            </motion.div>
          ) : (
            <motion.form key="review" {...step} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void q.handleLog(); }}>
              <ReviewFields f={q} extra={<ThreadPicker threads={threads} value={q.parentId} onChange={q.setParentId} />} />
              <ErrorLine error={q.error} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={q.back} className="h-11 flex-1">Back</Button>
                <Button type="submit" disabled={q.saving || !q.recipient.trim() || !q.subject.trim()} className="h-11 flex-1">{q.saving ? <><Loader2 className="animate-spin" /> Logging…</> : 'Log it'}</Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function ImportEmailDialog({ onClose, onLogged, onRefresh }: { onClose: () => void; onLogged: () => void; onRefresh?: () => void }) {
  const m = useEmailImport({ onLogged, onRefresh });
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const close = () => { clearEmailImportDrafts(); onClose(); };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="size-4 text-accent" /> Import a saved email</DialogTitle>
          <DialogDescription>Attach a saved email page (.html, .mhtml) or a text file. The fields are filled in for you to check before logging.</DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait" initial={false}>
          {!m.parsed ? (
            <motion.div key="pick" {...step} className="grid gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); m.handleFile(e.dataTransfer.files?.[0]); }}
                className={cn('grid place-items-center gap-1 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors', dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-foreground/25 hover:bg-muted/50')}
              >
                <motion.span animate={dragging ? { y: -4 } : { y: 0 }}><Upload className="size-6 text-muted-foreground" /></motion.span>
                <span className="text-sm font-medium">Drop a saved email here, or choose a file</span>
                <span className="text-xs text-muted-foreground">.html, .htm, .mhtml, .mht, .txt, .eml · up to 5 MB</span>
              </button>
              <input ref={fileRef} type="file" accept=".html,.htm,.mhtml,.mht,.txt,.eml" className="hidden" aria-label="Choose a saved email file" onChange={(e) => { m.handleFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button variant="ghost" onClick={() => m.setPasteMode(!m.pasteMode)} aria-expanded={m.pasteMode} className="h-11 justify-start"><FileText /> {m.pasteMode ? 'Hide the paste box' : 'Paste the email text instead'}</Button>
              {m.pasteMode && (
                <div className="grid gap-2">
                  <Label htmlFor="import-paste" className="sr-only">Saved email text</Label>
                  <Textarea id="import-paste" rows={6} value={m.pasteText} onChange={(e) => m.setPasteText(e.target.value)} placeholder="Paste the saved email here…" />
                  <Button onClick={m.handlePasteParse} className="h-11">Read it</Button>
                </div>
              )}
              <ErrorLine error={m.error} />
            </motion.div>
          ) : (
            <motion.form key="review" {...step} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void m.handleLog(); }}>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-success" /> Read from <span className="font-medium text-foreground">{m.fileName}</span>. Check the fields before logging.</p>
              <ReviewFields f={m} />
              <ErrorLine error={m.error} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void m.handleAiParse()} disabled={m.aiBusy} className="h-11">{m.aiBusy ? <><Loader2 className="animate-spin" /> Bruno is reading…</> : <><Sparkles /> Bruno</>}</Button>
                <Button type="button" variant="ghost" onClick={m.startOver} className="h-11">Start over</Button>
                <Button type="submit" disabled={m.saving || !m.recipient.trim() || !m.subject.trim()} className="h-11 sm:ml-auto">{m.saving ? <><Loader2 className="animate-spin" /> Logging…</> : 'Log it'}</Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
