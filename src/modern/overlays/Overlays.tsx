// Modern app-wide overlays (phase 9f): storage consent, feedback, the install
// prompt and the mention toast. Same behaviour as Classic through the shared
// hooks in components/overlays/useOverlays; the mention toast takes its data
// from App like the Classic one.
import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useCornerSlot } from '../chrome/useCornerSlot';
import { AtSign, Check, Cookie, FileText, Paperclip, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Switch, Textarea,
} from '../../components/ui-kit';
import { FEEDBACK_ACCEPT, FEEDBACK_TOPICS, useCookieConsent, useFeedbackForm, useInstallPrompt } from '../../components/overlays/useOverlays';

const rise = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 16 }, transition: { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] as const } };

// ---------------------------------------------------------------------------

export function CookieBar() {
  const c = useCookieConsent();
  return (
    <AnimatePresence>
      {c.visible && (
        <motion.div {...rise} className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5" role="region" aria-label="Storage preferences">
          <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl sm:p-5">
            {!c.customizing ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Cookie className="size-5 text-accent" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">How Control Point stores data</p>
                  <p className="mt-1 text-sm text-muted-foreground">Only first-party storage on your device: a session to keep you signed in, your theme, and this choice. No ad trackers, no third-party cookies.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => c.save({ necessary: true, functional: true })} className="h-11">Accept all</Button>
                    <Button variant="outline" onClick={() => c.save({ necessary: true, functional: false })} className="h-11">Essential only</Button>
                    <Button variant="ghost" onClick={() => c.setCustomizing(true)} className="h-11">Customize</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-medium">Storage preferences</p>
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  <li className="flex items-center justify-between gap-4 p-3">
                    <span><span className="block text-sm font-medium">Essential</span><span className="block text-xs text-muted-foreground">Sign-in session and security.</span></span>
                    <span className="text-xs text-muted-foreground">Always on</span>
                  </li>
                  <li className="flex items-center justify-between gap-4 p-3">
                    <Label htmlFor="consent-prefs" className="block font-normal"><span className="block text-sm font-medium">Preferences</span><span className="block text-xs text-muted-foreground">Theme and UI choices, saved on this device.</span></Label>
                    <Switch id="consent-prefs" checked={c.functional} onCheckedChange={c.setFunctional} />
                  </li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => c.save({ necessary: true, functional: c.functional })} className="h-11">Save my choice</Button>
                  <Button variant="ghost" onClick={() => c.setCustomizing(false)} className="h-11">Back</Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const f = useFeedbackForm();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" onPaste={f.handlePaste}>
        {f.sent ? (
          <div className="py-4 text-center">
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
              <Check className="size-6" />
            </motion.span>
            <DialogTitle className="mt-4">Feedback sent</DialogTitle>
            <DialogDescription className="mt-1">Thanks — Sushil reads every note personally.</DialogDescription>
            <Button onClick={onClose} className="mt-6 h-11 w-full">Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>Found a bug, have an idea, or just want to say hi? This goes straight to Sushil.</DialogDescription>
            </DialogHeader>
            <form onSubmit={f.submit} className="grid gap-4">
              <fieldset disabled={f.sending} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="feedback-topic">Topic</Label>
                  <Select value={f.category} onValueChange={f.setCategory}>
                    <SelectTrigger id="feedback-topic" className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{FEEDBACK_TOPICS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="feedback-message">Message</Label>
                  <Textarea id="feedback-message" rows={5} value={f.message} onChange={(e) => f.setMessage(e.target.value)} placeholder="Tell Sushil what's on your mind…" />
                </div>
                <input ref={f.fileInputRef} type="file" accept={FEEDBACK_ACCEPT} onChange={f.pickFile} className="hidden" aria-label="Attach a file" />
                {f.attachment ? (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-2">
                    {f.attachmentKind === 'image' && f.preview ? <img src={f.preview} alt="Attachment preview" className="size-12 rounded-lg object-cover" />
                      : f.attachmentKind === 'video' && f.preview ? <video src={f.preview} className="size-12 rounded-lg object-cover" muted playsInline />
                        : <span className="flex size-12 items-center justify-center rounded-lg bg-background"><FileText className="size-5 text-accent" /></span>}
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.attachment.name}</span><span className="block text-xs text-muted-foreground">Sends with your feedback</span></span>
                    <Button type="button" variant="ghost" size="icon" onClick={f.clearAttachment} aria-label="Remove attachment" className="size-11"><X /></Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => f.fileInputRef.current?.click()} className="h-11 border-dashed"><Paperclip /> Attach a screenshot, video or file</Button>
                )}
                <p className="text-xs text-muted-foreground">You can also paste an image straight in (Ctrl+V / ⌘V). Up to 25 MB.</p>
              </fieldset>
              <Button type="submit" disabled={f.sending || !f.message.trim()} className="h-11">{f.sending ? 'Sending…' : 'Send to Sushil'}</Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function InstallBanner() {
  const i = useInstallPrompt();
  const ref = useRef<HTMLDivElement>(null);
  useCornerSlot('banner', ref, i.visible);
  return (
    <AnimatePresence>
      {i.visible && (
        <motion.div ref={ref} {...rise} className="cp-slot-banner fixed inset-x-3 z-[60] md:inset-x-auto md:right-6 md:w-96" role="region" aria-label="Install the app">
          <div className="rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
            {!i.showIOSHelp ? (
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Smartphone className="size-5 text-accent" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Get the app</p>
                  <p className="text-sm text-muted-foreground">Add Control Point to your home screen for one-tap access.</p>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => void i.handleInstall()} className="h-11">{i.ios ? 'How to install' : 'Install'}</Button>
                    <Button variant="ghost" onClick={i.dismiss} className="h-11">Not now</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-medium">Add to Home Screen</p>
                <ol className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">1</span>Tap <Share className="size-4" /> Share in Safari</li>
                  <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">2</span>Tap <PlusSquare className="size-4" /> Add to Home Screen</li>
                  <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">3</span>Tap Add. It opens like an app.</li>
                </ol>
                <Button variant="outline" onClick={i.dismiss} className="mt-4 h-11 w-full">Got it</Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------

export function MentionToastCard({ toast, channelName, canJump, onJump, onDismiss }: {
  toast: { content?: string } | null;
  channelName?: string | null;
  canJump: boolean;
  onJump: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCornerSlot('mention', ref, !!toast);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          role="status"
          className="cp-slot-mention fixed right-5 z-[90] w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15"><AtSign className="size-4 text-accent" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Mentioned{channelName ? ` in #${channelName}` : ''}</p>
              <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{toast.content}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Dismiss" className="-mr-2 -mt-2 size-11"><X /></Button>
          </div>
          {canJump && <Button onClick={onJump} className="mt-3 h-11 w-full">Jump to #{channelName || 'chat'}</Button>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
