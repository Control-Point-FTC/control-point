import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, X, Send, ExternalLink, Sparkles } from 'lucide-react';
import { streamBuildHelper, type BuildHelperMessage } from '../services/aiService';

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

export default function BuildHelperChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next: BuildHelperMessage[] = [...messages, { role: 'user', text: content }];
    setMessages(next);
    setBusy(true);
    let agg = '';
    setMessages([...next, { role: 'model', text: '' }]);
    try {
      await streamBuildHelper(next, (chunk) => {
        agg += chunk;
        setMessages([...next, { role: 'model', text: agg }]);
      });
      if (!agg.trim()) {
        setMessages([...next, { role: 'model', text: "Volt hit a snag — please try again in a moment." }]);
      }
    } catch {
      setMessages([...next, { role: 'model', text: "Volt isn't reachable right now. Check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Volt build helper' : 'Open Volt build helper'}
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-accent text-primary shadow-[0_8px_30px_rgba(255,199,0,0.35)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-5 z-40 w-[380px] max-w-[calc(100vw-2.5rem)] h-[540px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl border border-white/10 bg-[#101014]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm leading-tight">Volt</p>
                  <p className="text-text-muted text-[11px] leading-tight">FTC build mentor · BIOBUZZ season</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-text-muted hover:text-white transition-colors">
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
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
                    <p className="text-[13px] text-white/85 leading-relaxed flex gap-2">
                      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>
                        Hey, I'm <span className="font-bold text-accent">Volt</span> — ask me anything about building
                        your FTC robot: mechanisms, code, strategy, or troubleshooting.
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
                        <Markdown>{m.text}</Markdown>
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
              className="p-3 border-t border-white/10 bg-white/[0.02]"
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
