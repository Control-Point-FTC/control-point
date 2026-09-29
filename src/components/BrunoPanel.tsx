import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { AnimatePresence, motion } from 'motion/react';
import { X, Send, ExternalLink, Sparkles, Maximize2 } from 'lucide-react';
import { streamBuildHelper, stripEventBlocks, detectBrunoDataActions, notifyBrunoDataChanged, type BuildHelperMessage } from '../services/aiService';
import { apiFetch } from '../services/api';

const RESOURCES = [
  { label: 'Game Manual 0', url: 'https://gm0.org' },
  { label: 'FTC Docs', url: 'https://ftc-docs.firstinspires.org' },
  { label: 'REV Docs', url: 'https://docs.revrobotics.com' },
  { label: 'Game & Season', url: 'https://www.firstinspires.org/resource-library/ftc/game-and-season-info' },
];

const STARTERS = [
  'How should we design an intake for BIOBUZZ pollen?',
  'Mecanum vs tank drive — which should we pick?',
  'Help me write a TeleOp OpMode in Java',
  'How do I tune PID for our lift?',
];

export default function BrunoPanel({ open, onClose, onExpand, currentUser, botName }: {
  open: boolean;
  onClose: () => void;
  onExpand: () => void;
  currentUser: any;
  botName?: string;
}) {
  const name = botName || 'Bruno';
  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Resume the user's most recent chat when the panel first opens
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    (async () => {
      try {
        const res = await apiFetch('/api/bruno/chats');
        if (!res.ok) return;
        const list = await res.json();
        const mine = currentUser ? list.filter((c: any) => c.member_id === currentUser.id) : list;
        const recent = mine[0];
        if (!recent) return;
        setChatId(recent.id);
        const r2 = await apiFetch(`/api/bruno/chats/${recent.id}`);
        if (r2.ok) {
          const data = await r2.json();
          setMessages((data.messages || []).map((m: any) => ({ role: m.role, text: m.text })));
        }
      } catch {
        /* fall back to ephemeral */
      }
    })();
  }, [open, historyLoaded, currentUser]);

  // Escape closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ensureChat = async (): Promise<number | null> => {
    if (chatId) return chatId;
    try {
      const res = await apiFetch('/api/bruno/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const created = await res.json();
      setChatId(created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const id = await ensureChat();
    const next: BuildHelperMessage[] = [...messages, { role: 'user', text: content }];
    setMessages(next);
    setBusy(true);
    let agg = '';
    setMessages([...next, { role: 'model', text: '' }]);
    try {
      await streamBuildHelper(next, (chunk) => {
        agg += chunk;
        setMessages([...next, { role: 'model', text: agg }]);
      }, id || undefined);
      if (!agg.trim()) {
        setMessages([...next, { role: 'model', text: `${name} hit a snag — please try again in a moment.` }]);
      } else {
        // Bruno may have inserted calendar/outreach data — refresh those views without a reload.
        notifyBrunoDataChanged(detectBrunoDataActions(agg));
      }
    } catch {
      setMessages([...next, { role: 'model', text: `${name} isn't reachable right now. Check your connection and try again.` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Transparent click-catcher over the rest of the screen (no dimming, Copilot-style) */}
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
          <motion.aside
            initial={{ x: 420, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="fixed right-0 top-0 z-50 h-full w-[400px] max-w-[94vw] flex flex-col bg-[#101014]/98 backdrop-blur-xl border-l border-white/10 shadow-2xl"
            role="complementary"
            aria-label={`${name} quick chat`}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] border border-accent/40 flex items-center justify-center shadow-[0_2px_10px_rgba(255,199,0,0.25)]">
                  <span className="text-[22px] leading-none" role="img" aria-label={`${name} the robot`}>🤖</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm leading-tight">{name}</p>
                  <p className="text-text-muted text-[11px] leading-tight">FTC build mentor · BIOBUZZ season</p>
                </div>
                <button
                  onClick={onExpand}
                  aria-label={`Open full ${name} view`}
                  title="Open full view"
                  className="p-1.5 text-text-muted hover:text-accent transition-colors"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button onClick={onClose} aria-label="Close" className="p-1.5 text-text-muted hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {RESOURCES.map((r) => (
                  <a
                    key={r.label}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-accent border border-white/10 hover:border-accent/40 rounded-full px-2 py-0.5 transition-colors"
                  >
                    {r.label}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
                    <p className="text-[13px] text-white/85 leading-relaxed flex gap-2">
                      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>
                        Hey, I'm <span className="font-bold text-accent">{name}</span> — ask me anything about building
                        your FTC robot: mechanisms, code, strategy, or scheduling.
                      </span>
                    </p>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Try one</p>
                  <div className="flex flex-col gap-1.5">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        disabled={busy}
                        className="text-left text-[12px] text-white/75 hover:text-accent bg-white/[0.03] hover:bg-accent/10 border border-white/[0.07] hover:border-accent/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-primary text-[13px] font-medium px-3.5 py-2.5 leading-relaxed">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/[0.07] px-3.5 py-2.5 text-[13px] text-white/85 leading-relaxed prose-sm">
                      {m.text ? (
                        <Markdown>{stripEventBlocks(m.text)}</Markdown>
                      ) : (
                        <span className="flex gap-1 items-center text-text-muted">
                          {[0, 1, 2].map((d) => (
                            <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="p-3 border-t border-white/10 bg-white/[0.02] flex-shrink-0"
            >
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about mechanisms, code, strategy…"
                  disabled={busy}
                  className="flex-1 min-w-0 bg-primary border border-white/10 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="w-10 h-10 shrink-0 rounded-xl bg-accent text-primary flex items-center justify-center hover:brightness-110 active:scale-95 transition disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-text-muted/60 mt-1.5 px-1">
                Grounded in GM0, FTC docs &amp; REV resources. Verify rules in the official manual.
              </p>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
