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
import { streamBuildHelper, applyActionProposals, applyActionProposalsWithIds, notifyBrunoDataChanged, type BuildHelperMessage, type ActionProposal } from '../../services/aiService';
import { applyAppearanceFromReply } from '../../services/brunoAppearance';
import { applyNavigateKeepingCards, brunoGo, createdToOpen } from '../../services/brunoNavigate';
import { type AttachedFile, type AttachedImage } from '../BrunoImageAttach';
import { withTextFiles } from '../../utils/brunoFiles';
import { type ProposalStatus } from '../ActionProposalCard';
import { resultLinks, type ResultLink } from './resultLinks';
import { useBatchedStream } from '../useBatchedStream';
import { confirmDialog, notify } from '../dialog';
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
  const [activeId, setActiveIdState] = useState<number | null>(() => {
    // Expanding the side panel passes its chat through location state so
    // the full view lands on the same conversation.
    const s = (location.state as any)?.chatId;
    return typeof s === 'number' && s > 0 ? s : null;
  });
  // The member picked a chat, started a new one or sent something: the chat
  // list arriving later must not switch them to the latest chat (V5 audit
  // Low 14: "New chat" right after opening /bruno lost the new conversation).
  const chose = useRef(activeId !== null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  /** The member's own choice of chat. */
  const setActiveId = useCallback((id: number | null) => { chose.current = true; setActiveIdState(id); }, []);
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
  // Images, PDFs and text files for the next message (cleared on send).
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  // What's attached right now (send's closure is older than files added while it runs).
  const attachedRef = useRef(attached);
  attachedRef.current = attached;
  const attachedFilesRef = useRef(attachedFiles);
  attachedFilesRef.current = attachedFiles;
  const addAttached = (imgs: AttachedImage[]) => {
    if (!imgs.length) return;
    setAttached((prev) => [...prev, ...imgs]);
  };
  // NavGPT -> Bruno coding handoff: once accepted, this chat stays on the plain
  // Bruno persona. Dismissed offers are tracked by message index.
  const [personaByChat, setPersonaByChat] = useState<Record<number, string>>({});
  const [dismissedSwitch, setDismissedSwitch] = useState<number[]>([]);
  // Data-action proposals: pending until the user confirms the card.
  const [proposalState, setProposalState] = useState<Record<number, { status: ProposalStatus; error?: string; links?: ResultLink[] }>>({});
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
      if (selectId !== undefined) setActiveIdState(selectId);
      // Open the latest chat only while the member hasn't chosen anything yet.
      else if (!chose.current && activeIdRef.current === null && list.length > 0 && !append) setActiveIdState(list[0].id);
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

  // A chat this page just created for a message being sent: its messages are
  // already on screen, so switching to it must not load the server copy.
  const createdHere = useRef<number | null>(null);

  useEffect(() => {
    // Used once: coming back to that chat later loads it as usual.
    const justCreated = activeId !== null && activeId === createdHere.current;
    createdHere.current = null;
    if (activeId === null || busyRef.current || justCreated) {
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
          setMessages(((data.messages || []) as BrunoChatMessage[]).map((m) => ({ role: m.role, text: m.text, ...(m.attachments?.length ? { saved: m.attachments } : {}) })));
        }
      } catch { /* keep previous */ }
    })();
  }, [activeId]);

  /** Stream one reply for `next` (already ending in the user's turn). */
  const streamReply = async (next: BuildHelperMessage[], chatId: number, opts: { persona?: string; images?: number; pdfs?: number; files?: number }) => {
    stream.start();
    let agg = '';
    const startedAt = Date.now();
    let gotFirst = false;
    let think: LiveThink = { steps: thinkingSteps({ page: getScreenContext()?.view ?? null, images: opts.images ?? 0, pdfs: opts.pdfs ?? 0, files: opts.files ?? 0, history: next.length }), startedAt, thoughtMs: null };
    setLiveThink(think);
    const ac = new AbortController();
    abortRef.current = ac;
    const replyIndex = next.length;
    // Only replies Bruno actually produced (or that were stopped mid-way)
    // keep their thinking record — a rejected request (AI not configured,
    // blocked, rate-limited) must not claim it read the page or attachments.
    const keepThinking = () => {
      const done = { ...think, thoughtMs: think.thoughtMs ?? Date.now() - startedAt };
      setThinkByIndex((m) => ({ ...m, [replyIndex]: done }));
    };
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
      if (agg.trim()) keepThinking();
      // "Turn on light mode": a finished reply's appearance block switches the theme here.
      applyAppearanceFromReply(agg);
      // "Show me my tasks": a navigate block opens that page.
      // A reply with a card stays here so the card isn't lost (see brunoNavigate).
      applyNavigateKeepingCards(agg);
    } catch (err: any) {
      // Stopped by the user: keep what was generated so far.
      if (err?.name !== 'AbortError') throw err;
      setMessages([...next, { role: 'model', text: agg.trim() ? `${agg}\n\n_Stopped._` : '_Stopped._' }]);
      keepThinking();
    } finally {
      stream.finish();
      abortRef.current = null;
      setLiveThink(null);
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if ((!content && !attached.length && !attachedFiles.length) || busyRef.current) return;
    chose.current = true;
    setInput('');
    const outgoing = attached;
    const outgoingFiles = attachedFiles;
    const outgoingPdfs = outgoingFiles.flatMap((f) => (f.kind === 'pdf' ? [{ mimeType: f.mimeType, data: f.data, name: f.name }] : []));
    const outgoingTexts = outgoingFiles.flatMap((f) => (f.kind === 'text' ? [{ name: f.name, text: f.text }] : []));
    setAttached([]);
    setAttachedFiles([]);
    let chatId = activeId;
    // Busy from the start: opening the new chat below must not load its
    // (still empty) server copy over the message being sent. Stop works from
    // the start too: it cancels creating the chat, and no reply begins.
    setBusy(true);
    busyRef.current = true;
    const startAc = new AbortController();
    abortRef.current = startAc;
    // The message wasn't sent: give it back, keeping anything typed or
    // attached since (the composer stays editable while busy). The sent
    // files go back first, then any added meanwhile.
    const giveBack = () => {
      setInput((cur) => (cur.trim() ? cur : content));
      setAttached([...outgoing, ...attachedRef.current]);
      setAttachedFiles([...outgoingFiles, ...attachedFilesRef.current]);
    };
    try {
      if (!chatId) {
        let res: Response;
        try {
          res = await apiFetch('/api/bruno/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), signal: startAc.signal });
        } catch (e) {
          // Stopped, or the connection dropped: the message comes back either way.
          giveBack();
          if (startAc.signal.aborted) return;
          throw e;
        }
        if (!res.ok || startAc.signal.aborted) {
          // Couldn't start the chat (or Stop was pressed): give the message back.
          giveBack();
          return;
        }
        const created = await res.json();
        chatId = created.id;
        createdHere.current = chatId;
        setActiveId(chatId);
      }
      if (startAc.signal.aborted) { giveBack(); return; }
      const next: BuildHelperMessage[] = [...messages, {
        role: 'user',
        // Text and code files go in the message itself (shown as chips).
        text: withTextFiles(content || (outgoing.length + outgoingFiles.length > 1 ? 'Take a look at these files.' : outgoingFiles.length ? 'Take a look at this file.' : 'What do you see in this screenshot?'), outgoingTexts),
        ...(outgoing.length ? { images: outgoing } : {}),
        ...(outgoingPdfs.length ? { pdfs: outgoingPdfs } : {}),
      }];
      setMessages(next);
      await streamReply(next, chatId!, { persona: personaByChat[chatId!], images: outgoing.length, pdfs: outgoingPdfs.length, files: outgoingTexts.length });
      fetchChats(chatId);
    } catch (e: any) {
      stream.finish();
      if (e?.status === 413) {
        // Too big to send (the server saved nothing): the message and its
        // files go back in the composer so the member can trim and resend.
        setMessages((prev) => prev.slice(0, -1));
        giveBack();
        notify(e.serverError || "That message is too big to send. Remove some files and try again.", 'error');
        return;
      }
      setMessages((prev) => [...prev, { role: 'model', text: e?.serverError || `${name} isn't reachable right now. Check your connection and try again.` }]);
    } finally {
      if (abortRef.current === startAc) abortRef.current = null;
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
      const result = await applyActionProposalsWithIds(proposals);
      const applied = result.applied;
      const types = Object.keys(applied).map((k) => (k === 'event' || k === 'delete-event' || k === 'event-rsvp' || k === 'away' ? 'calendar' : k === 'task-update' ? 'task' : k === 'part' ? 'cad-parts' : k));
      notifyBrunoDataChanged(types);
      setProposalState((s) => ({ ...s, [idx]: { status: 'done', links: resultLinks(result) } }));
      // "…then show it to me": open what was just created.
      const open = createdToOpen(proposals, result.created);
      if (open) brunoGo(open);
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
    attached, setAttached, attachedFiles, setAttachedFiles, addAttached,
    personaByChat, dismissedSwitch, proposalState, confirmProposals, dismissProposal, dismissSwitch, switchToBruno,
    renameChat, togglePublic, removeChat,
  };
}
