// Shared logic for the app-wide overlays (2026 redesign, phase 9f). Classic
// and Modern render the same hooks, so storage choices, feedback requests and
// the install flow behave identically in both looks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { notify } from '../dialog';
import { useDraft } from '../../modern/drafts';

// ---------------------------------------------------------------------------
// Cookie / storage consent

export function useCookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cp-consent');
      if (!saved) setVisible(true);
      else {
        const parsed = JSON.parse(saved);
        setFunctional(parsed.functional !== false);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  // Allow reopening from anywhere: window.dispatchEvent(new Event('cp:cookie-settings'))
  useEffect(() => {
    const open = () => { setCustomizing(true); setVisible(true); };
    window.addEventListener('cp:cookie-settings', open);
    return () => window.removeEventListener('cp:cookie-settings', open);
  }, []);

  const save = (choice: { necessary: true; functional: boolean }) => {
    try { localStorage.setItem('cp-consent', JSON.stringify({ ...choice, savedAt: new Date().toISOString() })); } catch { /* storage unavailable */ }
    setFunctional(choice.functional);
    setVisible(false);
    setCustomizing(false);
  };

  return { visible, customizing, setCustomizing, functional, setFunctional, save };
}

// ---------------------------------------------------------------------------
// Feedback (message, topic and attachment are drafted: they survive a look switch)

export const FEEDBACK_TOPICS = [
  { value: 'general', label: 'General' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature idea' },
  { value: 'question', label: 'Question' },
];
export const FEEDBACK_ACCEPT = 'image/*,video/*,.pdf,.txt,.md,.csv,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';

export function useFeedbackForm() {
  const [category, setCategory] = useDraft('feedback:category', 'general');
  const [message, setMessage] = useDraft('feedback:message', '');
  const [attachment, setAttachment] = useDraft<File | null>('feedback:file', null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The preview URL follows the (drafted) file; revoked when it changes.
  const preview = useMemo(() => (attachment ? URL.createObjectURL(attachment) : null), [attachment]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const attachmentKind: 'image' | 'video' | 'file' = attachment?.type.startsWith('video/') ? 'video' : attachment?.type.startsWith('image/') ? 'image' : 'file';

  const acceptFile = (f: File): boolean => {
    const mime = f.type || '';
    const name = f.name.toLowerCase();
    const ok = mime.startsWith('image/') || mime.startsWith('video/')
      || /\.(pdf|txt|md|markdown|csv|log|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)$/.test(name);
    if (!ok) {
      notify('That file type is not supported — use an image, video, or common document.', 'error');
      return false;
    }
    if (f.size > 25 * 1024 * 1024) {
      notify('Attachments must be under 25MB.', 'error');
      return false;
    }
    return true;
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (acceptFile(f)) setAttachment(f);
  };

  // Paste a screenshot / file straight from the clipboard (Ctrl+V / Cmd+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f && acceptFile(f)) {
          e.preventDefault();
          setAttachment(f);
          notify('Attachment pasted — ready to send.', 'success');
        }
        return;
      }
    }
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('category', category);
      form.append('message', message.trim());
      if (attachment) form.append('attachment', attachment);
      const res = await apiFetch('/api/feedback', { method: 'POST', body: form });
      if (res.ok) {
        clearAttachment();
        setMessage('');
        setCategory('general');
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        notify(data.error || 'Could not send feedback — try again.', 'error');
      }
    } catch {
      notify('Could not send feedback — try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  return {
    category, setCategory, message, setMessage, attachment, preview, attachmentKind, sending, sent,
    fileInputRef, pickFile, handlePaste, clearAttachment, submit,
  };
}

// ---------------------------------------------------------------------------
// "Add to Home Screen" prompt (mobile only; dismissal remembered for 30 days)

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'controlpoint-install-dismissed';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

function wasDismissedRecently(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isStandalone() || wasDismissedRecently()) return;
    // Only on mobile
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS has no beforeinstallprompt — show after a delay if not installed
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      timer = setTimeout(() => setVisible(true), 10000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    setVisible(false);
    setShowIOSHelp(false);
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS()) {
      setShowIOSHelp(true);
    }
  };

  return { visible, showIOSHelp, dismiss, handleInstall, ios: isIOS() };
}
