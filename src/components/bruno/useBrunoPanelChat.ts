// Shared logic for the ⌘J Bruno side panel (Legacy BrunoPanel and the Modern
// panel). Extracted from BrunoPanel: same endpoints, scouting "Analyze mode",
// page-aware rotating starters, queued "Scout with Bruno" prompts, the output
// length picker, throttled streaming, thinking steps and Stop.
//
// The conversation (messages, chat id, composer text, proposal and thinking
// state, busy flag) lives in the shared draft store, so switching between
// Legacy and Modern with the panel open keeps the chat — even a reply that is
// still streaming, because the stream writes to the store, not to a component.
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { streamBuildHelper, applyActionProposals, notifyBrunoDataChanged, type BuildHelperMessage, type ActionProposal } from '../../services/aiService';
import { getScoutingContext, subscribeScoutingContext, getScreenContext, BRUNO_OPEN_EVENT, type BrunoOpenDetail } from '../../services/brunoContext';
import { MAX_BRUNO_IMAGES, type AttachedImage, type AttachedPdf } from '../BrunoImageAttach';
import { type ProposalStatus } from '../ActionProposalCard';
import { getDraft, useDraft } from '../../modern/drafts';
import type { ScoutingContextRequest } from '../../types/ftcScout';
import { starterPoolForPath, nextStarters } from '../brunoStarters';
import { thinkingSteps, type ThinkingStep } from './BrunoThinking';

export const BRUNO_RESOURCES = [
  { label: 'Game Manual 0', url: 'https://gm0.org' },
  { label: 'FTC Docs', url: 'https://ftc-docs.firstinspires.org' },
  { label: 'REV Docs', url: 'https://docs.revrobotics.com' },
  { label: 'Game & Season', url: 'https://www.firstinspires.org/resource-library/ftc/game-and-season-info' },
];

export const OUTPUT_LEVELS = [
  { value: 'low', label: 'Low', desc: 'Brief replies' },
  { value: 'medium', label: 'Medium', desc: 'Balanced detail' },
  { value: 'high', label: 'High', desc: 'Full explanations' },
] as const;

const ANALYZE_POOL = {
  greeting: 'Analyze mode — ask me about this scouting view.',
  prompts: [
    'Who is our best potential alliance partner here?',
    'Who should we scout next?',
    'What is our biggest weakness compared with the event average?',
    'What information is missing before we make a scouting decision?',
    'Which teams have the most consistent autonomous?',
    'Compare our cycle times to the top teams here',
  ],
};

// The in-flight reply's AbortController lives at module scope (like the
// conversation in the draft store) so Stop still works after a mode switch
// swaps the panel component mid-reply.
let panelAbort: AbortController | null = null;

type ThinkMeta = Record<number, { steps: ThinkingStep[]; startedAt: number; thoughtMs: number | null }>;
const EMPTY_MSGS: BuildHelperMessage[] = [];
const EMPTY_OBJ = {};

export function useBrunoPanelChat({ open, onClose, currentUser, botName, onActiveChatId, onUserSaved }: {
  open: boolean;
  onClose: () => void;
  currentUser: any;
  botName?: string;
  onActiveChatId?: (id: number | null) => void;
  onUserSaved?: (user: any) => void;
}) {
  const name = botName || 'Bruno';
  const [messages, setMessages] = useDraft<BuildHelperMessage[]>('bruno-panel:messages', EMPTY_MSGS);
  const [chatId, setChatId] = useDraft<number | null>('bruno-panel:chat', null);
  const [input, setInput] = useDraft<string>('bruno-panel:input', '');
  const [busy, setBusy] = useDraft<boolean>('bruno-panel:busy', false);
  const [thinkMeta, setThinkMeta] = useDraft<ThinkMeta>('bruno-panel:think', EMPTY_OBJ as ThinkMeta);
  const [proposalState, setProposalState] = useDraft<Record<number, { status: ProposalStatus; error?: string }>>('bruno-panel:proposals', EMPTY_OBJ);
  const stop = () => panelAbort?.abort();
  // A cleared conversation (new chat) drops the per-reply thinking data.
  useEffect(() => { if (messages.length === 0 && Object.keys(thinkMeta).length) setThinkMeta(EMPTY_OBJ as ThinkMeta); }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmProposals = async (idx: number, proposals: ActionProposal[]) => {
    setProposalState((s) => ({ ...s, [idx]: { status: 'confirming' } }));
    try {
      const applied = await applyActionProposals(proposals);
      const types = Object.keys(applied).map((k) => (k === 'event' || k === 'delete-event' ? 'calendar' : k));
      notifyBrunoDataChanged(types);
      setProposalState((s) => ({ ...s, [idx]: { status: 'done' } }));
    } catch (e: any) {
      setProposalState((s) => ({ ...s, [idx]: { status: 'error', error: e?.message || 'Something went wrong' } }));
    }
  };
  const dismissProposal = (idx: number) => setProposalState((s) => ({ ...s, [idx]: { status: 'dismissed' } }));

  // Analyze mode (Team Stats): the page publishes what it's looking at; the
  // panel forwards it with each message and swaps in scouting starters.
  const [scoutCtx, setScoutCtx] = useState(getScoutingContext);
  useEffect(() => subscribeScoutingContext(() => setScoutCtx(getScoutingContext())), []);
  // Context-aware rotating starters that follow the current page.
  const [starterPath, setStarterPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setStarterPath(window.location.pathname);
    window.addEventListener('popstate', update);
    // React-router navigations don't fire popstate; poll cheaply.
    const t = setInterval(update, 1000);
    return () => { window.removeEventListener('popstate', update); clearInterval(t); };
  }, []);
  const starterPool = scoutCtx ? ANALYZE_POOL : starterPoolForPath(starterPath);
  const [starterSeen, setStarterSeen] = useState<number[]>([]);
  const [starterBatch, setStarterBatch] = useState<string[]>(() => nextStarters(starterPoolForPath(window.location.pathname), []).batch);
  useEffect(() => {
    const { batch, seen } = nextStarters(starterPool, []);
    setStarterBatch(batch);
    setStarterSeen(seen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterPath, scoutCtx]);
  const refreshStarters = () => {
    const { batch, seen } = nextStarters(starterPool, starterSeen);
    setStarterBatch(batch);
    setStarterSeen(seen);
  };
  const [greeting, setGreeting] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ text: string; scouting?: ScoutingContextRequest } | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<BrunoOpenDetail>).detail || {};
      if (d.greeting) setGreeting(d.greeting);
      if (d.prompt) setPendingPrompt({ text: d.prompt, scouting: d.scouting });
    };
    window.addEventListener(BRUNO_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(BRUNO_OPEN_EVENT, onOpen);
  }, []);
  useEffect(() => { if (!scoutCtx) setGreeting(null); }, [scoutCtx]);

  // Screenshots / PDFs for the next message — in memory only, never saved.
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  const [attachedPdfs, setAttachedPdfs] = useState<AttachedPdf[]>([]);
  const addAttached = (imgs: AttachedImage[]) => {
    if (!imgs.length) return;
    setAttached((prev) => [...prev, ...imgs].slice(0, MAX_BRUNO_IMAGES));
  };

  // Output length — the same member preference as Settings → Bruno AI.
  const [outputLevel, setOutputLevel] = useState('medium');
  useEffect(() => {
    const lvl = currentUser?.bruno_output_level; // 'max' was removed → 'high'
    setOutputLevel(lvl === 'max' ? 'high' : (lvl || 'medium'));
  }, [currentUser?.bruno_output_level, open]);
  const levelSaving = useRef(false);
  const changeOutputLevel = async (lvl: string) => {
    if (levelSaving.current || lvl === outputLevel) return;
    levelSaving.current = true;
    const prev = outputLevel;
    setOutputLevel(lvl);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser?.name || '', role: currentUser?.role || '', bruno_output_level: lvl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) onUserSaved?.(data.user);
      else setOutputLevel(prev);
    } catch {
      setOutputLevel(prev);
    } finally {
      levelSaving.current = false;
    }
  };

  // Every "new chat" starts fresh; past chats stay in the full view.
  const newChat = () => {
    if (getDraft('bruno-panel:busy', false)) return;
    setChatId(null);
    setMessages(EMPTY_MSGS);
    setProposalState(EMPTY_OBJ);
    setInput('');
    setAttached([]);
    setAttachedPdfs([]);
  };

  // Report the active conversation so "expand" lands on the same chat.
  useEffect(() => { onActiveChatId?.(chatId); }, [chatId, onActiveChatId]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ensureChat = async (): Promise<number | null> => {
    const existing = getDraft<number | null>('bruno-panel:chat', null);
    if (existing) return existing;
    try {
      const res = await apiFetch('/api/bruno/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) return null;
      const created = await res.json();
      setChatId(created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  const send = async (text?: string, scoutingOverride?: ScoutingContextRequest) => {
    const content = (text ?? input).trim();
    if ((!content && !attached.length && !attachedPdfs.length) || getDraft('bruno-panel:busy', false)) return;
    setInput('');
    const outgoing = attached;
    const outgoingPdfs = attachedPdfs;
    setAttached([]);
    setAttachedPdfs([]);
    setBusy(true);
    const id = await ensureChat();
    const userMsg: BuildHelperMessage = { role: 'user', text: content || (outgoingPdfs.length ? 'What do you see in these documents?' : 'What do you see in this screenshot?') };
    if (outgoing.length) userMsg.images = outgoing;
    if (outgoingPdfs.length) userMsg.pdfs = outgoingPdfs;
    const next: BuildHelperMessage[] = [...getDraft<BuildHelperMessage[]>('bruno-panel:messages', EMPTY_MSGS), userMsg];
    let agg = '';
    setMessages([...next, { role: 'model', text: '' }]);
    // What Bruno is actually given for this reply (its thinking steps).
    const replyIndex = next.length;
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;
    setThinkMeta((m) => ({
      ...m,
      [replyIndex]: {
        steps: thinkingSteps({ page: getScreenContext()?.view ?? null, images: outgoing.length, pdfs: outgoingPdfs.length, scouting: !!(scoutingOverride ?? getScoutingContext()), history: next.length }),
        startedAt,
        thoughtMs: null,
      },
    }));
    const ac = new AbortController();
    panelAbort = ac;
    // Throttle streamed renders (~11/sec); the accumulator keeps every char.
    let renderTimer: number | null = null;
    const pushRender = () => { renderTimer = null; setMessages([...next, { role: 'model', text: agg }]); };
    try {
      await streamBuildHelper(next, (chunk) => {
        agg += chunk;
        if (firstTokenAt === null && chunk.trim()) {
          firstTokenAt = Date.now();
          const ms = firstTokenAt - startedAt;
          setThinkMeta((m) => (m[replyIndex] ? { ...m, [replyIndex]: { ...m[replyIndex], thoughtMs: ms } } : m));
        }
        if (renderTimer === null) renderTimer = window.setTimeout(pushRender, 90);
      }, id || undefined, { scouting: scoutingOverride ?? getScoutingContext() ?? undefined, signal: ac.signal });
      if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
      setMessages([...next, { role: 'model', text: agg.trim() ? agg : `${name} hit a snag — please try again in a moment.` }]);
    } catch (e: any) {
      if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
      if (e?.name === 'AbortError') {
        setMessages([...next, { role: 'model', text: agg.trim() ? `${agg}\n\n_Stopped._` : '_Stopped._' }]);
        setThinkMeta((m) => (m[replyIndex] && m[replyIndex].thoughtMs == null ? { ...m, [replyIndex]: { ...m[replyIndex], thoughtMs: Date.now() - startedAt } } : m));
      } else {
        setThinkMeta((m) => { const { [replyIndex]: _drop, ...rest } = m; return rest; });
        setMessages([...next, { role: 'model', text: e?.serverError || `${name} isn't reachable right now. Check your connection and try again.` }]);
      }
    } finally {
      if (panelAbort === ac) panelAbort = null;
      setBusy(false);
    }
  };

  // "Scout with Bruno" buttons queue a prompt; send it once the panel is open.
  useEffect(() => {
    if (open && pendingPrompt && !busy) {
      const p = pendingPrompt;
      setPendingPrompt(null);
      void send(p.text, p.scouting);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt, busy]);

  return {
    name, messages, chatId, input, setInput, busy, thinkMeta, stop, send, newChat,
    proposalState, confirmProposals, dismissProposal,
    scoutCtx, greeting, starterPool, starterBatch, refreshStarters,
    attached, setAttached, attachedPdfs, setAttachedPdfs, addAttached,
    outputLevel, changeOutputLevel,
  };
}
