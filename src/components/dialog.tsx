// In-app dialog system — replaces every native confirm()/alert().
// A module-level singleton: call confirmDialog()/notify() from anywhere,
// render <DialogHost /> once near the app root.

import React, { useEffect, useReducer, useState } from 'react';
import { X, CheckCircle2, Info, AlertCircle } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title?: string;
  message: string;
  /** The exact text the user must type to confirm (compared verbatim). */
  expected: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ToastKind = 'info' | 'success' | 'error';

interface PendingConfirm {
  seq: number;
  opts: Required<Pick<ConfirmOptions, 'message'>> & ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface PendingPrompt {
  seq: number;
  opts: Required<Pick<PromptOptions, 'message' | 'expected'>> & PromptOptions;
  resolve: (value: boolean) => void;
}

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let confirmQueue: PendingConfirm[] = [];
let promptQueue: PendingPrompt[] = [];
let toasts: Toast[] = [];
let nextToastId = 1;
let nextConfirmSeq = 1;
const listeners = new Set<() => void>();
const TOAST_MS = 4000;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Show a modal confirm dialog. Resolves `true` when the user confirms,
 * `false` when they cancel (button, backdrop, or Escape). Concurrent calls
 * are queued and shown one at a time, in order.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmQueue.push({ seq: nextConfirmSeq++, opts, resolve });
    emit();
  });
}

/**
 * Show a modal typed-confirmation dialog. Resolves `true` only when the user
 * types exactly `opts.expected`; `false` on cancel (button, backdrop, Escape).
 */
export function promptDialog(opts: PromptOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    promptQueue.push({ seq: nextConfirmSeq++, opts, resolve });
    emit();
  });
}

/** Fire-and-forget toast notification. Auto-dismisses after ~4s. */
export function notify(message: string, kind: ToastKind = 'info'): void {
  const id = nextToastId++;
  toasts.push({ id, message, kind });
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, TOAST_MS);
}

function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function settleConfirm(value: boolean) {
  const head = confirmQueue.shift();
  emit();
  head?.resolve(value);
}

function settlePrompt(value: boolean) {
  const head = promptQueue.shift();
  emit();
  head?.resolve(value);
}

const btnBase =
  'px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-semibold';
const btnSecondary = 'bg-elevated text-text-base hover:bg-text-base/10 border border-text-base/10';
const btnDanger = 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 border border-rose-500/30';
const btnPrimary = 'bg-accent text-accent-ink hover:brightness-105 shadow-[0_4px_16px_rgba(255,199,0,0.25)]';

function ConfirmModal({ pending }: { pending: PendingConfirm }) {
  const { opts } = pending;
  const title = opts.title;
  const confirmLabel = opts.confirmLabel || 'Confirm';
  const cancelLabel = opts.cancelLabel || 'Cancel';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settleConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => settleConfirm(false)}
    >
      <div
        className="card-surface p-6 flex flex-col gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] w-full max-w-md"
        role="alertdialog"
        aria-modal="true"
        aria-label={title || 'Confirm'}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h3 className="text-lg font-display font-bold text-text-base tracking-tight">{title}</h3>
        )}
        <p className="text-sm text-text-muted leading-relaxed">{opts.message}</p>
        <div className="flex gap-3 justify-end">
          <button type="button" className={`${btnBase} ${btnSecondary}`} onClick={() => settleConfirm(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${btnBase} ${opts.danger ? btnDanger : btnPrimary}`}
            onClick={() => settleConfirm(true)}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptModal({ pending }: { pending: PendingPrompt }) {
  const { opts } = pending;
  const title = opts.title;
  const confirmLabel = opts.confirmLabel || 'Confirm';
  const cancelLabel = opts.cancelLabel || 'Cancel';
  const [value, setValue] = useState('');
  const matches = value === opts.expected;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settlePrompt(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => settlePrompt(false)}
    >
      <div
        className="card-surface p-6 flex flex-col gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] w-full max-w-md"
        role="alertdialog"
        aria-modal="true"
        aria-label={title || 'Confirm'}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h3 className="text-lg font-display font-bold text-text-base tracking-tight">{title}</h3>
        )}
        <p className="text-sm text-text-muted leading-relaxed">{opts.message}</p>
        <div>
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={opts.placeholder || `Type "${opts.expected}" to confirm`}
            className="w-full bg-text-base/5 border border-text-base/10 rounded-xl px-4 py-2.5 text-sm text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
            onKeyDown={(e) => { if (e.key === 'Enter' && matches) settlePrompt(true); }}
          />
          <p className="text-[11px] text-text-muted/70 mt-1.5">
            Type <span className="font-mono font-bold text-text-base/90">{opts.expected}</span> exactly to confirm.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" className={`${btnBase} ${btnSecondary}`} onClick={() => settlePrompt(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!matches}
            className={`${btnBase} ${opts.danger ? btnDanger : btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}
            onClick={() => settlePrompt(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const toastStyles: Record<ToastKind, { wrap: string; icon: typeof Info; iconClass: string }> = {  info: {
    wrap: 'border-text-base/10',
    icon: Info,
    iconClass: 'text-accent',
  },
  success: {
    wrap: 'border-emerald-500/30',
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
  },
  error: {
    wrap: 'border-rose-500/30',
    icon: AlertCircle,
    iconClass: 'text-rose-400',
  },
};

function ToastStack({ items }: { items: Toast[] }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]">
      {items.map((t) => {
        const s = toastStyles[t.kind];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={`card-surface px-4 py-3 flex items-start gap-3 border ${s.wrap} shadow-[0_8px_30px_rgba(0,0,0,0.35)]`}
            role="status"
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.iconClass}`} />
            <p className="text-sm text-text-base/90 leading-relaxed flex-1">{t.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-text-muted hover:text-text-base transition-colors shrink-0"
              onClick={() => dismissToast(t.id)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Render once near the app root. Drives the confirm modal queue + toast stack. */
export function DialogHost(): React.JSX.Element {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribe(force), []);

  return (
    <>
      {confirmQueue[0] && <ConfirmModal key={`c${confirmQueue[0].seq}`} pending={confirmQueue[0]} />}
      {!confirmQueue[0] && promptQueue[0] && (
        <PromptModal key={`p${promptQueue[0].seq}`} pending={promptQueue[0]} />
      )}
      <ToastStack items={toasts} />
    </>
  );
}
