// Shared saved-email import for the Communication log (Classic modal and the
// Modern dialog): read a saved .html / .mhtml / .txt / .eml file or pasted
// text with the deterministic parser, optionally refine with Bruno, review,
// then POST /api/communications. Fields are drafted (a look switch keeps
// them); a file read or Bruno reply after sign-out never writes back, and only
// the newest Bruno reply may fill the form.
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { streamBuildHelper, extractActionProposals } from '../../services/aiService';
import { apiUrl, apiFetch } from '../../services/api';
import { deleteDraft, getDraft, inEpoch, newSessionId, setDraft, useDraft } from '../../modern/drafts';
import { MAX_FILE_BYTES, parseEmailFile, type ParsedEmail } from './emailParse';

const K = 'comm-import:';
const KEYS = ['session', 'parse-seq', 'saving', 'logged', 'fileName', 'parsed', 'recipient', 'subject', 'body', 'date', 'type', 'direction', 'pasteMode', 'pasteText'];
/** Forget a logged or abandoned import. */
export function clearEmailImportDrafts() {
  KEYS.forEach((k) => deleteDraft(K + k));
}

export function useEmailImport({ onLogged, onRefresh }: { onLogged: () => void; onRefresh?: () => void }) {
  // This dialog's session: kept across a look switch, gone once it closes, so
  // a reply or save from an abandoned dialog never touches a reopened one.
  const [session] = useState(() => {
    let id = getDraft<number | null>(`${K}session`, null);
    if (id == null) { id = newSessionId(); setDraft(`${K}session`, id); }
    return id;
  });
  const current = () => getDraft<number | null>(`${K}session`, null) === session;
  // Drafted and owned by the session: a remount (look switch) mid-save keeps
  // the lock, so the same entry can't be sent twice.
  const [savingFor, setSavingFor] = useDraft<number | null>(`${K}saving`, null);
  const saving = savingFor != null && savingFor === session;
  // A finished save marks its session logged; the dialog mounted for that
  // session now (maybe in the other look) clears the draft and closes.
  const [logged] = useDraft<number | null>(`${K}logged`, null);
  useEffect(() => {
    if (logged === session) { clearEmailImportDrafts(); onLogged(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged]);
  const [fileName, setFileName] = useDraft(`${K}fileName`, '');
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useDraft(`${K}parsed`, false);
  const [recipient, setRecipient] = useDraft(`${K}recipient`, '');
  const [subject, setSubject] = useDraft(`${K}subject`, '');
  const [body, setBody] = useDraft(`${K}body`, '');
  const [date, setDate] = useDraft(`${K}date`, format(new Date(), 'yyyy-MM-dd HH:mm'));
  const [type, setType] = useDraft(`${K}type`, 'email');
  const [direction, setDirection] = useDraft<'inbound' | 'outbound'>(`${K}direction`, 'outbound');
  const [aiBusy, setAiBusy] = useState(false);
  const [pasteMode, setPasteMode] = useDraft(`${K}pasteMode`, false);
  const [pasteText, setPasteText] = useDraft(`${K}pasteText`, '');

  const applyParsed = (p: ParsedEmail, name: string) => {
    setRecipient(p.recipient);
    setSubject(p.subject);
    setBody(p.body);
    setDate(p.date);
    setType(p.type);
    setFileName(name);
    setParsed(true);
    setError(p.recipient || p.subject ? null : 'Could not detect the email fields — fill them in below.');
  };

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError('That file is over 5 MB — saved email pages are usually much smaller.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    const live = inEpoch((fn: () => void) => { if (current()) fn(); });
    reader.onload = () => live(() => {
      try {
        const p = parseEmailFile(f.name, String(reader.result || ''));
        applyParsed(p, f.name);
      } catch {
        setError('Could not read that file — try pasting the text instead.');
      }
    });
    reader.onerror = () => setError('Could not read that file — try pasting the text instead.');
    reader.readAsText(f);
  };

  const handlePasteParse = () => {
    const t = pasteText.trim();
    if (!t) {
      setError('Paste the saved email text first.');
      return;
    }
    setError(null);
    applyParsed(parseEmailFile('pasted.txt', t), 'pasted text');
  };

  const handleAiParse = async () => {
    const source = body || pasteText;
    if (!source.trim() || aiBusy) return;
    setAiBusy(true);
    setError(null);
    const seq = getDraft<number>(`${K}parse-seq`, 0) + 1;
    setDraft(`${K}parse-seq`, seq);
    // Newest parse of this dialog session only (and never after a sign-out).
    const apply = inEpoch((fn: () => void) => { if (current() && seq === getDraft<number>(`${K}parse-seq`, 0)) fn(); });
    let agg = '';
    try {
      await streamBuildHelper([
        { role: 'user', text: `You are helping import a saved email into the team's communication log. The user opened the "Import email" box and clicked "Parse with Bruno" — that click is their confirmation that they want the entry proposed. Extract the recipient (To), subject, body text, date, and direction (outbound if the team sent it, inbound if someone outside wrote to the team) from the email below and propose it with the \`\`\`communications block exactly as your communications log skill specifies. Resolve relative dates against today's date from your context. If the recipient is truly impossible to determine, ask one short clarifying question (no block). Do not include the page's navigation chrome or ads in the body — just the email content.\n\nEmail to parse:\n"""${source.slice(0, 6000)}"""` },
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
        setParsed(true);
        setError(null);
      });
      else {
        const note = agg.replace(/```communications[\s\S]*?(```|$)/g, '').replace(/```[\s\S]*?(```|$)/g, '').trim();
        apply(() => setError(note || 'Bruno could not pull the email details out — fill in the fields below.'));
      }
    } catch (e: any) {
      setError(e?.serverError || e?.message || "Bruno isn't reachable right now — fill in the fields below.");
    } finally {
      setAiBusy(false);
    }
  };

  const handleLog = async () => {
    if (!recipient.trim() || !subject.trim() || getDraft<number | null>(`${K}saving`, null) === session) return;
    setSavingFor(session);
    // Only this session's lock is released (never a newer dialog's).
    const release = inEpoch(() => { if (getDraft<number | null>(`${K}saving`, null) === session) setSavingFor(null); });
    setError(null);
    try {
      // Use the shared apiFetch so the real session id (X-Session-ID) travels
      // with the request — a hardcoded storage key here once sent an empty
      // session and the server answered 401 "Not signed in".
      const res = await apiFetch(apiUrl('/api/communications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: recipient.trim(), subject: subject.trim(), body: body.trim(), date, type, direction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not log it — try again.');
      // Saved: always refresh the log (even if no dialog is mounted right now,
      // e.g. mid look switch). Only the dialog that sent it is cleared and
      // closed, by whichever instance is mounted for its session.
      onRefresh?.();
      if (current()) setDraft(`${K}logged`, session);
    } catch (e: any) {
      setError(e?.message || 'Could not log it — try again.');
    } finally {
      release();
    }
  };

  const startOver = () => { setParsed(false); setPasteText(''); };
  return {
    fileName, error, parsed, recipient, setRecipient, subject, setSubject, body, setBody, date, setDate, type, setType,
    direction, setDirection, aiBusy, saving, pasteMode, setPasteMode, pasteText, setPasteText,
    handleFile, handlePasteParse, handleAiParse, handleLog, startOver,
  };
}
