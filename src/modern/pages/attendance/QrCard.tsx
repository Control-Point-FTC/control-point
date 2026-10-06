// QR check-in session (admins): pick a length, start, then show the QR, the
// day code and a live countdown; "Present" fills the screen for a projector.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Maximize2, QrCode, Square, Timer } from 'lucide-react';
import {
  Button, Card, Dialog, DialogContent, DialogDescription, DialogTitle, Skeleton, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { QR_DURATIONS, formatCountdown, useQrSession } from '../../../components/attendance/useAttendanceController';

export function QrCard({ teamName }: { teamName: string }) {
  const qr = useQrSession();
  const [presenting, setPresenting] = useState(false);
  const live = !!qr.session;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2.5">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />}
            <span className={live ? 'relative inline-flex size-2.5 rounded-full bg-success' : 'relative inline-flex size-2.5 rounded-full bg-muted-foreground/40'} />
          </span>
          <div>
            <p className="text-sm font-semibold">QR check-in</p>
            <p className="text-xs text-muted-foreground">{live ? 'Live — students scan to mark themselves present' : 'Students scan a projected code to check in'}</p>
          </div>
        </div>
        {live && <span className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground"><Timer className="size-4" /> {formatCountdown(qr.remaining)}</span>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {qr.loading ? (
          <div key="loading" className="space-y-3 p-5"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-40" /></div>
        ) : !live ? (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 p-5">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Session length</p>
              <ToggleGroup
                type="single"
                value={String(qr.duration)}
                onValueChange={(v) => { if (v) qr.setDuration(v === 'today' ? 'today' : Number(v)); }}
                aria-label="Session length"
                className="flex-wrap justify-start"
              >
                {QR_DURATIONS.map((d) => (
                  <ToggleGroupItem key={d.label} value={String(d.value)} className="px-3 max-sm:h-11">{d.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Button onClick={() => void qr.start()} disabled={qr.busy} className="max-sm:h-11 max-sm:w-full">
              {qr.busy ? <Loader2 className="animate-spin" /> : <QrCode />} Start check-in
            </Button>
          </motion.div>
        ) : (
          <motion.div key="live" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 p-5">
            <div className="shrink-0 rounded-xl bg-white p-3 shadow-sm">
              <QRCodeSVG value={qr.session.url} size={168} level="M" />
            </div>
            <div className="w-full min-w-0 space-y-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">No camera? Day code</p>
                <p className="font-mono text-3xl font-semibold tracking-[0.2em]">{qr.session.code}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => setPresenting(true)} className="max-sm:h-11"><Maximize2 /> Present</Button>
                <Button variant="ghost" className="text-destructive hover:text-destructive max-sm:h-11" disabled={qr.busy} onClick={async () => { await qr.stop(); setPresenting(false); }}>
                  <Square /> End session
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={presenting && live} onOpenChange={setPresenting}>
        <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col items-center justify-center gap-6 rounded-none border-0 bg-black text-center text-white sm:max-w-none">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-white/60">{teamName}</p>
            <DialogTitle className="mt-2 text-3xl font-semibold text-white sm:text-5xl">Scan to check in</DialogTitle>
            <DialogDescription className="sr-only">Projected QR code and day code for attendance check-in</DialogDescription>
          </div>
          {qr.session && (
            <div className="rounded-3xl bg-white p-5 sm:p-8">
              <QRCodeSVG value={qr.session.url} size={Math.min(420, typeof window !== 'undefined' ? window.innerWidth - 120 : 300)} level="M" />
            </div>
          )}
          <div>
            <p className="text-sm uppercase tracking-widest text-white/60">No camera? Enter code</p>
            <p className="font-mono text-5xl font-semibold tracking-[0.25em] sm:text-6xl">{qr.session?.code}</p>
          </div>
          <p className="text-sm tabular-nums text-white/50">Ends in {formatCountdown(qr.remaining)}</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
