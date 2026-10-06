// Shared conversation logic for the full Bruno page — Legacy BrunoView and
// the Modern Bruno page. Extracted from BrunoView: same endpoints
// (/api/bruno/chats*, /api/ai/build-helper via streamBuildHelper,
// /api/ai/apply-actions), same NavGPT→Bruno handoff and proposal flow. Adds
// the honest thinking steps + Stop (AbortSignal) for both sends and the
// handoff. The composer text is drafted so it survives a Legacy/Modern switch.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../../services/api';
import { getScreenContext } from '../../services/brunoContext';
import { streamBuildHelper, applyActionProposals, notifyBrunoDataChanged, type BuildHelperMessage, type ActionProposal } from '../../services/aiService';
import { MAX_BRUNO_IMAGES, type AttachedImage, type AttachedPdf } from '../BrunoImageAttach';
import { type ProposalStatus } from '../ActionProposalCard';
import { useBatchedStream } from '../useBatchedStream';
import { confirmDialog } from '../dialog';
import { useDraft } from '../../modern/drafts';
import type { BrunoChat, BrunoChatMessage } from '../../types/bruno';
import { thinkingSteps, type ThinkingStep } from './BrunoThinking';

export interface LiveThink { steps: ThinkingStep[]; startedAt: number; thoughtMs: number | null }

const CHAT_PAGE = 30;

export function useBrunoConversation({ currentUser, hasScope, botName }: { currentUser: any; hasScope?: (s: string) => boolean; botName?: string }) {
  const name = botName || 'Bruno';
  const location = useLocation();
  const [chats, setChats] = useState<BrunoChat[]>([]);
  const [chatsHasMore, setChatsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(() => {
    // Expanding the side panel passes its chat through location state so
    // the full view lands on the same conversation.
    const s = (location.state as any)?.chatId;
    return typeof s === 'number' && s > 0 ? s : null;
  });
  // Same, for expands that happen while the full view is already mounted.
  useEffect(() => {
    const s = (location.state as any)?.chatId;
    if (typeof s === 'number' && s > 0 && s !== activeId) setActiveId(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  const [input, setInput] = useDraft<string>('bruno:input', '');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [liveThink, setLiveThink] = useState<LiveThink | null>(null);
  // Thinking record per finished reply (by message index), so a completed
  // answer can still show "Thought for Ns" and its steps.
  const [thinkByIndex, setThinkByIndex] = useState<Record<number, LiveThink>>({});
  const abortRef = useRef<AbortController | null>(null);
  // Screenshots / PDFs attached to the next message — cleared on send, never saved.
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  const [attachedPdfs, setAttachedPdfs] = useState<AttachedPdf[]>([]);
  const addAttached = (imgs: AttachedImage[]) => {
    if (!imgs.length) return;
    setAttached((prev) => [...prev, ...imgs].slice(0, MAX_BRUNO_IMAGES));
  };
  // NavGPT -> Bruno coding handoff: once accepted, this chat stays on the plain
  // Bruno persona. Dismissed offers are tracked by message index.
  const [personaByChat, setPersonaByChat] = useState<Record<number, string>>({});
  const [dismissedSwitch, setDismissedSwitch] = useState<number[]>([]);
  // Data-action proposals: pending until the user confirms the card.
  const [proposalState, setProposalState] = useState<Record<number, { status: ProposalStatus; error?: string }>>({});
  // Batched streaming (40ms) — the in-flight reply renders outside `messages`.
  const stream = useBatchedStream(40);

  const isAdmin = hasScope ? hasScope('admin') : false;
  const activeChat = chats.find((c) => c.id === activeId) || null;
  const isOwner = !!(activeChat && currentUser && activeChat.member_id === currentUser.id);

  const fetchChats = async (selectId?: number | null, append = false) => {
    try {
      const offset = append ? chats.length : 0;
      const res = await apiFetch(`/api/bruno/chats?limit=${CHAT_PAGE}&offset=${offset}`);
      const list: BrunoChat[] = res.ok ? await res.json() : [];
      setChats((prev) => (append ? [...prev, ...list] : list));
      setChatsHasMore(list.length === CHAT_PAGE);
      if (selectId !== undefined) setActiveId(selectId);
      else if (activeId === null && list.length > 0 && !append) setActiveId(list[0].id);
    } catch {
      /* offline — keep empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId === null || busyRef.current) {
      if (activeId === null) setMessages([]);
      return;
    }
    setDismissedSwitch([]);
    setProposalState({});
    setThinkByIndex({});
    (async () => {
      try {
        const res = await apiFetch(`/api/bruno/chats/${activeId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(((data.messages || []) as BrunoChatMessage[]).map((m) => ({ role: m.role, text: m.text })));
        }
      } catch { /* keep previous */ }
    })();
  }, [activeId]);

  /** Stream one reply for `next` (already ending in the user's turn). */
  const streamReply = async (next: BuildHelperMessage[], chatId: number, opts: { persona?: string; images?: number; pdfs?: number }) => {
    stream.start();
    let agg = '';
    const startedAt = Date.now();
    let gotFirst = false;
    let think: LiveThink = { steps: thinkingSteps({ page: getScreenContext()?.view ?? null, images: opts.images ?? 0, pdfs: opts.pdfs ?? 0, history: next.length }), startedAt, thoughtMs: null };
    setLiveThink(think);
    const ac = new AbortController();
    abortRef.current = ac;
    const replyIndex = next.length;
    try {
      await streamBuildHelper(next, (chunk) => {
        agg += chunk;
        if (!gotFirst && chunk.trim()) {
          gotFirst = true;
          const ms = Date.now() - startedAt;
          think = { ...think, thoughtMs: ms };
          setLiveThink((t) => (t ? { ...t, thoughtMs: ms } : t));
        }
        stream.push(chunk);
      }, chatId, { ...(opts.persona ? { persona: opts.persona } : {}), signal: ac.signal });
      setMessages([...next, { role: 'model', text: agg.trim() ? agg : `${name} hit a snag — please try again in a moment.` }]);
    } catch (err: any) {
      // Stopped by the user: keep what was generated so far.
      if (err?.name !== 'AbortError') throw err;
      setMessages([...next, { role: 'model', text: agg.trim() ? `${agg}\n\n_Stopped._` : '_Stopped._' }]);
    } finally {
      stream.finish();
      abortRef.current = null;
      setLiveThink(null);
      const done = { ...think, thoughtMs: think.thoughtMs ?? Date.now() - startedAt };
      setThinkByIndex((m) => ({ ...m, [replyIndex]: done }));
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if ((!content && !attached.length && !attachedPdfs.length) || busyRef.current) return;
    setInput('');
    const outgoing = attached;
    const outgoingPdfs = attachedPdfs;
    setAttached([]);
    setAttachedPdfs([]);
    let chatId = activeId;
    try {
      if (!chatId) {
        const res = await apiFetch('/api/bruno/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (!res.ok) return;
        const created = await res.json();
        chatId = created.id;
        setActiveId(chatId);
      }
      const next: BuildHelperMessage[] = [...messages, {
        role: 'user',
        text: content || (outgoingPdfs.length ? 'What do you see in these documents?' : 'What do you see in this screenshot?'),
        ...(outgoing.length ? { images: outgoing } : {}),
        ...(outgoingPdfs.length ? { pdfs: outgoingPdfs } : {}),
      }];
      setMessages(next);
      setBusy(true);
      busyRef.current = true;
      await streamReply(next, chatId!, { persona: personaByChat[chatId!], images: outgoing.length, pdfs: outgoingPdfs.length });
      fetchChats(chatId);
    } catch (e: any) {
      stream.finish();
      setMessages((prev) => [...prev, { role: 'model', text: e?.serverError || `${name} isn't reachable right now. Check your connection and try again.` }]);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  /** Stop the in-flight reply (keeps the partial text). */
  const stop = () => abortRef.current?.abort();

  // NavGPT coding handoff accepted: drop the offer, pin this chat to Bruno,
  // and have Bruno answer the pending question directly.
  const switchToBruno = useCallback(async () => {
    const cid = activeId;
    if (!cid || busyRef.current) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx < 0) return;
    const base = messages.slice(0, lastUserIdx + 1);
    setMessages(base);
    setPersonaByChat((m) => ({ ...m, [cid]: 'bruno' }));
    setBusy(true);
    busyRef.current = true;
    try {
      await streamReply(base, cid, { persona: 'bruno' });
    } catch {
      setMessages([...base, { role: 'model', text: `Bruno isn't reachable right now. Check your connection and try again.` }]);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
    fetchChats(cid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messages, personaByChat]);

  const confirmProposals = useCallback(async (idx: number, proposals: ActionProposal[]) => {
    setProposalState((s) => ({ ...s, [idx]: { status: 'confirming' } }));
    try {
      const applied = await applyActionProposals(proposals);
      const types = Object.keys(applied).map((k) => (k === 'event' || k === 'delete-event' ? 'calendar' : k));
      notifyBrunoDataChanged(types);
      setProposalState((s) => ({ ...s, [idx]: { status: 'done' } }));
    } catch (e: any) {
      setProposalState((s) => ({ ...s, [idx]: { status: 'error', error: e?.message || 'Something went wrong' } }));
    }
  }, []);
  const dismissProposal = useCallback((idx: number) => {
    setProposalState((s) => ({ ...s, [idx]: { status: 'dismissed' } }));
  }, []);
  const dismissSwitch = useCallback((idx: number) => {
    setDismissedSwitch((d) => (d.includes(idx) ? d : [...d, idx]));
  }, []);

  const renameChat = async (title: string) => {
    if (!activeChat || !isOwner) return;
    const t = title.trim();
    if (!t || t === activeChat.title) return;
    try {
      const res = await apiFetch(`/api/bruno/chats/${activeChat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
      if (res.ok) fetchChats(activeChat.id);
    } catch { /* ignore */ }
  };

  const togglePublic = async () => {
    if (!activeChat || !isOwner) return;
    try {
      const res = await apiFetch(`/api/bruno/chats/${activeChat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_public: !activeChat.is_public }) });
      if (res.ok) fetchChats(activeChat.id);
    } catch { /* ignore */ }
  };

  const removeChat = async (chat: any) => {
    if (!chat) return;
    if (!(await confirmDialog({ title: 'Delete chat', message: `Delete "${chat.title || 'Untitled chat'}"? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      const res = await apiFetch(`/api/bruno/chats/${chat.id}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = chats.filter((c) => c.id !== chat.id);
        setChats(remaining);
        if (activeId === chat.id) {
          setActiveId(remaining.length ? remaining[0].id : null);
          setMessages([]);
        }
      }
    } catch { /* ignore */ }
  };

  /** Start a fresh conversation (the chat is created on first send). */
  const newChat = () => { if (!busyRef.current) { setActiveId(null); setMessages([]); setThinkByIndex({}); } };

  const myChats = chats.filter((c) => currentUser && c.member_id === currentUser.id);
  const teamChats = chats.filter((c) => !(currentUser && c.member_id === currentUser.id));
  const lastModelIdx = messages.map((m) => m.role).lastIndexOf('model');

  return {
    name, chats, myChats, teamChats, chatsHasMore, loading, fetchChats,
    activeId, setActiveId, activeChat, isOwner, isAdmin, newChat,
    messages, lastModelIdx, input, setInput, busy, liveThink, thinkByIndex, stream, send, stop,
    attached, setAttached, attachedPdfs, setAttachedPdfs, addAttached,
    personaByChat, dismissedSwitch, proposalState, confirmProposals, dismissProposal, dismissSwitch, switchToBruno,
    renameChat, togglePublic, removeChat,
  };
}
