// Shared Bruno quick-add logic for the Communication log (Classic dialog and
// the Modern one): paste an email, Bruno proposes the entry (recipient,
// subject, body, date, type, direction, thread), everything is editable, then
// POST /api/communications. The paste and the fields are drafted, so a look
// switch keeps them; only the newest parse may fill the form.
import { useState } from 'react';
import { format } from 'date-fns';
import { streamBuildHelper, extractActionProposals } from '../../services/aiService';
import { apiFetch } from '../../services/api';
import { deleteDraft, getDraft, inEpoch, newSessionId, setDraft, useDraft } from '../../modern/drafts';

export interface QuickAddThread {
  id: number;
  subject: string;
  recipient: string;
  date: string;
}

const K = 'comm-quickadd:';
const KEYS = ['session', 'parse-seq', 'paste', 'parsed', 'manual', 'recipient', 'subject', 'body', 'date', 'type', 'direction', 'parent'];
/** Forget a logged or abandoned quick-add. */
export function clearQuickAddDrafts() {
  KEYS.forEach((k) => deleteDraft(K + k));
}

export function useBrunoQuickAdd({ threads, onLogged, onRefresh }: { threads: QuickAddThread[]; onLogged: () => void; onRefresh?: () => void }) {
  // This dialog's session: kept across a look switch, gone once it closes, so
  // a reply or save from an abandoned dialog never touches a reopened one.
  const [session] = useState(() => {
    let id = getDraft<number | null>(`${K}session`, null);
    if (id == null) { id = newSessionId(); setDraft(`${K}session`, id); }
    return id;
  });
  const current = () => getDraft<number | null>(`${K}session`, null) === session;
  const [paste, setPaste] = useDraft(`${K}paste`, '');
  const [aiBusy, setAiBusy] = useState(false);
  const [parsed, setParsed] = useDraft(`${K}parsed`, false);
  const [manual, setManual] = useDraft(`${K}manual`, false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState('');

  const [recipient, setRecipient] = useDraft(`${K}recipient`, '');
  const [subject, setSubject] = useDraft(`${K}subject`, '');
  const [body, setBody] = useDraft(`${K}body`, '');
  const [date, setDate] = useDraft(`${K}date`, format(new Date(), 'yyyy-MM-dd HH:mm'));
  const [type, setType] = useDraft(`${K}type`, 'email');
  const [direction, setDirection] = useDraft<'inbound' | 'outbound'>(`${K}direction`, 'outbound');
  const [parentId, setParentId] = useDraft<number | null>(`${K}parent`, null);

  const handleParse = async () => {
    const source = paste.trim();
    if (!source || aiBusy) {
      if (!source) setError('Paste the email first.');
      return;
    }
    setAiBusy(true);
    setError(null);
    const seq = getDraft<number>(`${K}parse-seq`, 0) + 1;
    setDraft(`${K}parse-seq`, seq);
    // Only the newest parse, in the same draft epoch (not after a sign-out),
    // may fill the form.
    // Newest parse of this dialog session only (and never after a sign-out).
    const apply = inEpoch((fn: () => void) => { if (current() && seq === getDraft<number>(`${K}parse-seq`, 0)) fn(); });
    let agg = '';
    try {
      const threadList = threads.slice(0, 30).map((t) =>
        `- id ${t.id}: "${t.subject}" with ${t.recipient} (${t.date})`
      ).join('\n');
      await streamBuildHelper([
        { role: 'user', text:
`You are helping quick-add an email to the team's communication log. The user pasted an email below and clicked "Parse with Bruno" — that click is their confirmation that they want the entry proposed.

Extract every field and propose it with the \`\`\`communications block exactly as your communications log skill specifies (recipient, subject, body, date, type, direction, parent_id).

- direction: "outbound" if the TEAM sent this email (From is a team member), "inbound" if someone outside wrote to the team.
- The paste may be a single email, a reply, or a follow-up the team sent. If it clearly continues one of these existing threads, set parent_id to that thread's ROOT id. Otherwise omit parent_id (new thread).

Existing threads:
${threadList || '(none yet)'}

Resolve relative dates against today's date from your context. If the recipient is truly impossible to determine, ask one short clarifying question (no block). Just the email content in the body — no signatures from quoted history beyond what's needed.

Email to parse:
"""${source.slice(0, 8000)}"""` },
      ], (chunk) => { agg += chunk; }, undefined, { persona: 'bruno' });
      const items = extractActionProposals(agg).find((p) => p.kind === 'communication')?.items || [];
      if (items.length) apply(() => {
        const c = items[0];
        setRecipient(String(c.recipient || ''));
        setSubject(String(c.subject || ''));
        setBody(String(c.body || ''));
        setDate(/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) ? `${c.date} 12:00` : format(new Date(), 'yyyy-MM-dd HH:mm'));
        setType(c.type === 'announcement' ? 'announcement' : 'email');
        setDirection(c.direction === 'inbound' ? 'inbound' : 'outbound');
        const pid = Number(c.parent_id);
        setParentId(Number.isInteger(pid) && pid > 0 && threads.some((t) => t.id === pid) ? pid : null);
        setParsed(true);
        setError(null);
      });
      else {
        const note = agg.replace(/```communications[\s\S]*?(```|$)/g, '').replace(/```[\s\S]*?(```|$)/g, '').trim();
        apply(() => setError(note || 'Bruno could not pull the details out — fill in the fields below.'));
      }
    } catch (e: any) {
      setError(e?.serverError || e?.message || "Bruno isn't reachable right now — fill in the fields below.");
    } finally {
      setAiBusy(false);
    }
  };

  const handleLog = async () => {
    if (!recipient.trim() || !subject.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipient.trim(),
          subject: subject.trim(),
          body: body.trim(),
          date,
          type,
          direction,
          parent_id: parentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not log it — try again.');
      // Saved either way; only the dialog that sent it is cleared and closed.
      if (current()) {
        clearQuickAddDrafts();
        onLogged();
      } else {
        onRefresh?.();
      }
    } catch (e: any) {
      setError(e?.message || 'Could not log it — try again.');
    } finally {
      setSaving(false);
    }
  };

  // Thread picker: search across ALL threads; the AI prompt still gets a
  // capped list to keep the prompt small. The selected thread is always kept
  // visible so the user can see where the message will be saved.
  const threadOptions = (() => {
    const q = threadSearch.trim().toLowerCase();
    const base = q
      ? threads.filter((t) =>
          t.subject.toLowerCase().includes(q) || t.recipient.toLowerCase().includes(q)
        )
      : threads;
    if (parentId != null && !base.some((t) => t.id === parentId)) {
      const selected = threads.find((t) => t.id === parentId);
      if (selected) return [selected, ...base];
    }
    return base;
  })();

  const showFields = parsed || manual;
  /** Back to the paste step (keeps the paste). */
  const back = () => { setParsed(false); setManual(false); setError(null); setThreadSearch(''); };
  return {
    paste, setPaste, aiBusy, parsed, manual, setManual, saving, error, setError, threadSearch, setThreadSearch,
    recipient, setRecipient, subject, setSubject, body, setBody, date, setDate, type, setType, direction, setDirection,
    parentId, setParentId, threadOptions, showFields, handleParse, handleLog, back,
  };
}
