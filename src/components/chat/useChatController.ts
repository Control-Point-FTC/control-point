// Shared Messages logic for the Legacy ChatView and the Modern Messages page.
// Extracted verbatim from ChatView: optimistic socket sends (client_id
// reconciliation), file upload (10 MB), mentions (@Name → @[Name], @everyone,
// @here), reply / forward / copy / delete (optimistic with rollback),
// reactions, older-message paging, and the admin channel / category actions.
// The composer text and the pending attachment are drafted.
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { apiFetch } from '../../services/api';
import { notify } from '../dialog';
import { useDraft } from '../../modern/drafts';
import { useVoice } from '../../voice/VoiceContext';
import { useContextMenu } from '../contextmenu/ContextMenuProvider';
import { postReactionToggle } from '../MessageReactions';

export interface ChatControllerDeps {
  messages: any[]; setMessages: (v: any) => void; msgCache: React.MutableRefObject<Map<number, any[]>>; msgExhausted: React.MutableRefObject<Map<number, boolean>>;
  members: any[]; currentUser: any; socket: WebSocket | null; channels: any[]; setChannels: (v: any) => void;
  activeChannelId: number | null; setActiveChannelId: (id: number) => void; isAdmin: boolean;
  handleCreateChannel: (name: string, topic: string, categoryId: number | null) => Promise<any>;
  handleCreateCategory: (name: string) => Promise<any>; handleRenameCategory: (id: number, name: string) => Promise<any>;
  handleMoveChannel: (id: number, categoryId: number | null) => Promise<any>;
  /** Legacy's member context-menu items (call / mention / copy ID). */
  memberMenuItems: (opts: any) => any[];
}

export function useChatController({ messages, setMessages, msgCache, msgExhausted, members, currentUser, socket, channels, setChannels, activeChannelId, setActiveChannelId, isAdmin, handleCreateChannel, handleCreateCategory, handleRenameCategory, handleMoveChannel, memberMenuItems }: ChatControllerDeps) {
  // Composer draft lives in the shared draft store so switching Legacy/Modern keeps it.
  const [content, setContent] = useDraft<string>('chat:content', '');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useDraft<File | null>('chat:file', null);
  const [pendingPreview, setPendingPreview] = useDraft<string | null>('chat:preview', null);
  const [dragging, setDragging] = useState(false);
  const [showChannelsMobile, setShowChannelsMobile] = useState(false);
  const [showMembersMobile, setShowMembersMobile] = useState(false);
  const [showMemberList, setShowMemberList] = useState(true);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [creatingIn, setCreatingIn] = useState<number | 'uncat' | null>(null); // category id (or 'uncat') the new-channel form belongs to
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelTopic, setNewChannelTopic] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCat, setRenamingCat] = useState<number | null>(null);
  const [renameCatName, setRenameCatName] = useState('');
  const [renamingChannel, setRenamingChannel] = useState<number | null>(null);
  const [renameChannelName, setRenameChannelName] = useState('');
  const [moveMenuFor, setMoveMenuFor] = useState<number | null>(null); // channel id with the move-to-category menu open
  const [dragChannelId, setDragChannelId] = useState<number | null>(null); // admin drag-and-drop between categories
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // 'cat:<id>' | 'uncat'
  const [reactPickerFor, setReactPickerFor] = useState<number | null>(null); // message id with the reaction picker open
  const voice = useVoice();

  // Right-click a member in the member list: call, mention, copy ID.
  // (No friending/DMs — calls open a public team voice channel.)
  useContextMenu('member-chat', (el) => {
    const id = Number(el.dataset.cmId);
    const m = (members || []).find((x: any) => x.id === id);
    if (!m) return null;
    return memberMenuItems({
      m,
      isSelf: m.id === currentUser?.id,
      canCall: true,
      onCall: (memberId, media) => voice.startCall([memberId], media),
      onMention: () => {
        setContent((prev: string) => (prev ? prev + ' ' : '') + `@${m.name} `);
        composerRef.current?.focus();
      },
    });
  });

  // Admin drag-and-drop: drop a channel row onto a category header to move it.
  const handleDropOnCategory = async (e: React.DragEvent, categoryId: number | null) => {
    e.preventDefault();
    setDragOverTarget(null);
    const raw = e.dataTransfer.getData('text/plain');
    const id = dragChannelId ?? parseInt(raw, 10);
    setDragChannelId(null);
    if (!isAdmin || !Number.isFinite(id)) return;
    const chan = (channels || []).find((c: any) => c.id === id);
    if (!chan || (chan.category_id ?? null) === categoryId) return;
    await handleMoveChannel(id, categoryId);
  };
  const [collapsedCats, setCollapsedCats] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`cp-collapsed-cats-${currentUser?.team_id ?? 'x'}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const toggleCat = (id: number) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(`cp-collapsed-cats-${currentUser?.team_id ?? 'x'}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  // reply + forward state
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [forwardMsg, setForwardMsg] = useState<any | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  // touch devices have no hover — tapping a message reveals its action bar
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null);
  const [isTouchDevice] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Cursor pagination: per-channel "no more older messages" flags (shared ref from parent).
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadOlderMessages = async () => {
    if (!activeChannelId || loadingOlder || (messages || []).length === 0) return;
    if (msgExhausted.current.get(activeChannelId)) return;
    setLoadingOlder(true);
    try {
      const oldestId = (messages as any[])[0]?.id;
      if (!oldestId) return;
      const res = await apiFetch(`/api/messages?channel_id=${activeChannelId}&limit=100&before=${oldestId}`);
      const older: any[] = res.ok ? await res.json() : [];
      if (older.length < 100) msgExhausted.current.set(activeChannelId, true);
      if (older.length > 0) {
        setMessages((prev: any[]) => {
          const seen = new Set((prev || []).map((m: any) => m.id));
          const fresh = older.filter((m: any) => !seen.has(m.id));
          const next = [...fresh, ...(prev || [])];
          msgCache.current.set(activeChannelId, next);
          return next;
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const activeChannel = (channels || []).find((c: any) => c.id === activeChannelId) || (channels || [])[0];
  const canPostInChannel = isAdmin || !activeChannel?.post_restricted;
  // Discord shows no tombstones — deleted messages vanish
  const visibleMessages = (messages || []).filter((m: any) => !m.deleted_at);

  const scrollToMessage = (id: number) => {
    const el = msgRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(id);
      window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
    }
  };

  const startReply = (msg: any) => {
    setReplyTo({ id: msg.id, sender_name: msg.sender_name, content: msg.content });
    composerRef.current?.focus();
  };

  const copyMessageText = async (msg: any) => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      notify('Message copied.', 'info');
    } catch {
      notify('Could not copy that message.', 'error');
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChannelId]);

  const convertMentions = (text: string) => {
    // Match @Full Name for multi-word names — longest names first
    let out = text;
    const sorted = [...members].sort((a: any, b: any) => b.name.length - a.name.length);
    for (const m of sorted) {
      out = out.split(`@${m.name}`).join(`@[${m.name}]`);
    }
    // Broadcast pings (kept out of the name loop so a member literally named
    // "everyone" can't shadow them)
    out = out.split('@everyone').join('@[everyone]');
    out = out.split('@here').join('@[here]');
    return out;
  };

  const handleSend = async () => {
    if ((!content.trim() && !pendingFile) || !socket || uploading) return;
    if (!canPostInChannel) return;
    const finalContent = convertMentions(content);
    const replyToId = replyTo?.id || null;
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (pendingFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('sender_id', currentUser.id.toString());
      formData.append('sender_name', currentUser.name);
      formData.append('content', finalContent);
      if (activeChannelId) formData.append('channel_id', activeChannelId.toString());
      if (replyToId) formData.append('reply_to_id', replyToId.toString());
      try {
        const response = await apiFetch('/api/messages/upload', { method: 'POST', body: formData });
        if (response.ok) {
          setContent('');
          setReplyTo(null);
          clearPending();
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          notify('Could not send that file.', 'error');
        }
      } catch (error) {
        console.error('Upload error:', error);
        notify('Could not send that file.', 'error');
      } finally {
        setUploading(false);
      }
      return;
    }

    // Optimistic: show the message instantly, reconcile when the server echoes it.
    const optimisticMsg = {
      id: clientId,
      client_id: clientId,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: finalContent,
      channel_id: activeChannelId,
      reply_to_id: replyToId,
      reply_sender_name: replyTo?.sender_name || null,
      reply_content: replyTo?.content || null,
      timestamp: new Date().toISOString(),
      pending: true,
    };
    setMessages(prev => {
      const next = [...prev, optimisticMsg];
      if (activeChannelId != null) msgCache.current.set(activeChannelId, next);
      return next;
    });
    socket.send(JSON.stringify({
      type: 'chat',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: finalContent,
      channel_id: activeChannelId,
      reply_to_id: replyToId,
      client_id: clientId,
    }));
    setContent('');
    setReplyTo(null);
  };

  const handleForward = async (targetChannelId: number) => {
    if (!forwardMsg || !socket) return;
    const target = (channels || []).find((c: any) => c.id === targetChannelId);
    socket.send(JSON.stringify({
      type: 'chat',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: forwardMsg.content || '',
      channel_id: targetChannelId,
      is_forwarded: 1,
      forwarded_from: `${forwardMsg.sender_name || 'Unknown'} · #${activeChannel?.name || 'general'}`,
      file_path: forwardMsg.file_path || null,
      file_name: forwardMsg.file_name || null,
      file_size: forwardMsg.file_size || null,
    }));
    setForwardMsg(null);
    if (targetChannelId !== activeChannelId) {
      setActiveChannelId(targetChannelId);
      notify(`Forwarded to #${target?.name || 'channel'}.`, 'info');
    }
  };

  const clearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const queueFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify('Files must be under 10 MB.', 'error'); return; }
    clearPending();
    setPendingFile(file);
    if (file.type.startsWith('image/')) setPendingPreview(URL.createObjectURL(file));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      queueFile(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) queueFile(files[0]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    queueFile(e.target.files?.[0] || undefined);
  };

  const handleDeleteMessage = async (msgId: number) => {
    // Optimistic: vanish instantly like Discord does. The server hard-deletes
    // and broadcasts message_deleted (deleted_permanently), whose socket
    // handler is a no-op once we've already removed it. Roll back on failure.
    const removed = (messages || []).find((m: any) => m.id === msgId);
    const cur = activeChannelId;
    const drop = (list: any[]) => list.filter((m: any) => m.id !== msgId);
    setMessages((prev: any[]) => {
      const next = drop(prev);
      if (cur != null) msgCache.current.set(cur, next);
      return next;
    });
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('delete failed');
    } catch (error) {
      console.error('Delete error:', error);
      if (removed) {
        setMessages((prev: any[]) => {
          const next = [...prev, removed].sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
          if (cur != null) msgCache.current.set(cur, next);
          return next;
        });
        notify('Could not delete that message.', 'error');
      }
    }
  };

  // Update a message's reactions in state (optimistic or from server/socket).
  // Recently-used reaction emojis for the hover toolbar quick-react buttons.
  const [recentReactions, setRecentReactions] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('cp-recent-reactions') || '[]');
      return Array.isArray(raw) ? raw.filter((e) => typeof e === 'string').slice(0, 3) : [];
    } catch {
      return [];
    }
  });
  const recordRecentReaction = (emoji: string) => {
    if (!emoji || emoji.startsWith('custom:')) return;
    setRecentReactions((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 3);
      try {
        localStorage.setItem('cp-recent-reactions', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };
  const handleReactionsChange = (messageId: number, reactions: any[]) => {
    const cur = activeChannelId;
    setMessages((prev: any[]) => {
      const next = prev.map((m: any) => (m.id === messageId ? { ...m, reactions } : m));
      if (cur != null) msgCache.current.set(cur, next);
      return next;
    });
  };

  // Pick an emoji from the picker → toggle it on the message.
  const handlePickReaction = async (messageId: number, emoji: string) => {
    setReactPickerFor(null);
    recordRecentReaction(emoji);
    try {
      const server = await postReactionToggle(messageId, emoji);
      handleReactionsChange(messageId, server);
    } catch (e: any) {
      notify(e?.message || 'Could not add reaction.', 'error');
    }
  };

  const handleCreateChannelSubmit = async () => {
    const name = newChannelName.trim();
    if (!name) return;
    const catId = creatingIn === 'uncat' ? null : creatingIn;
    const ch = await handleCreateChannel(name, newChannelTopic.trim(), catId);
    if (ch) {
      setNewChannelName('');
      setNewChannelTopic('');
      setCreatingIn(null);
      setCreatingChannel(false);
      setShowChannelsMobile(false);
    }
  };

  const handleCreateCategorySubmit = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const cat = await handleCreateCategory(name);
    if (cat) {
      setNewCategoryName('');
      setCreatingCategory(false);
    }
  };

  const handleRenameCategorySubmit = async () => {
    if (renamingCat == null) return;
    const name = renameCatName.trim();
    if (!name) return;
    const cat = await handleRenameCategory(renamingCat, name);
    if (cat) {
      setRenamingCat(null);
      setRenameCatName('');
    }
  };

  const handleRenameChannelSubmit = async () => {
    if (renamingChannel == null) return;
    const name = renameChannelName.trim();
    if (!name) return;
    const res = await apiFetch(`/api/chat/channels/${renamingChannel}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { notify(data.error || 'Could not rename channel.', 'error'); return; }
    if (data.channel) {
      setChannels((prev: any[]) => prev.map((c: any) => (c.id === data.channel.id ? data.channel : c)));
    }
    setRenamingChannel(null);
    setRenameChannelName('');
    notify('Channel renamed.', 'success');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && replyTo) {
      e.preventDefault();
      setReplyTo(null);
      return;
    }
    if (e.key === 'Tab' && showMentions && filteredMentions.length > 0) {
      e.preventDefault();
      const m = filteredMentions[0];
      const parts = content.split(' ');
      parts.pop();
      setContent([...parts, `@${m.name} `].join(' '));
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onContentChange = (e: any) => {
    const val = e.target.value;
    setContent(val);
    const lastWord = val.split(' ').pop();
    if (lastWord.startsWith('@')) {
      setMentionSearch(lastWord.slice(1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const filteredMentions = [
    ...[
      { id: 'everyone', name: 'everyone', special: 'Notify everyone in the team' },
      { id: 'here', name: 'here', special: 'Notify everyone viewing this channel' },
    ].filter((m) => m.name.includes(mentionSearch.toLowerCase())),
    ...members.filter((m: any) => m.name.toLowerCase().includes(mentionSearch.toLowerCase())),
  ];


  // Admin: toggle admin-only posting (same PATCH as Legacy's channel menu).
  const togglePostRestricted = async (c: any) => {
    try {
      const res = await apiFetch(`/api/chat/channels/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_restricted: c.post_restricted ? 0 : 1 }),
      });
      if (!res.ok) throw new Error();
      notify(c.post_restricted ? `#${c.name} is open for everyone to post.` : `#${c.name} is now admin-only.`, 'success');
    } catch { notify('Could not change that setting.', 'error'); }
  };

  return {
    togglePostRestricted,
    content, setContent, mentionSearch, setMentionSearch, showMentions, setShowMentions, uploading, setUploading, pendingFile, setPendingFile, pendingPreview, setPendingPreview, dragging, setDragging, showChannelsMobile, setShowChannelsMobile, showMembersMobile, setShowMembersMobile, showMemberList, setShowMemberList, creatingChannel, setCreatingChannel, creatingIn, setCreatingIn, newChannelName, setNewChannelName, newChannelTopic, setNewChannelTopic, creatingCategory, setCreatingCategory, newCategoryName, setNewCategoryName, renamingCat, setRenamingCat, renameCatName, setRenameCatName, renamingChannel, setRenamingChannel, renameChannelName, setRenameChannelName, moveMenuFor, setMoveMenuFor, dragChannelId, setDragChannelId, dragOverTarget, setDragOverTarget, reactPickerFor, setReactPickerFor, voice, handleDropOnCategory, collapsedCats, setCollapsedCats, toggleCat, showTeamMenu, setShowTeamMenu, replyTo, setReplyTo, forwardMsg, setForwardMsg, flashId, setFlashId, activeMsgId, setActiveMsgId, isTouchDevice, scrollRef, fileInputRef, composerRef, msgRefs, loadingOlder, setLoadingOlder, loadOlderMessages, activeChannel, canPostInChannel, visibleMessages, scrollToMessage, startReply, copyMessageText, convertMentions, handleSend, handleForward, clearPending, queueFile, handlePaste, handleDrop, handleFileUpload, handleDeleteMessage, recentReactions, setRecentReactions, recordRecentReaction, handleReactionsChange, handlePickReaction, handleCreateChannelSubmit, handleCreateCategorySubmit, handleRenameCategorySubmit, handleRenameChannelSubmit, handleKeyDown, onContentChange, filteredMentions,
  };
}
