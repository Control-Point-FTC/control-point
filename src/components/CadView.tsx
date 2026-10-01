// CAD section: Onshape doc hub, design reviews, 3D snapshots, parts/BOM.
// Team-scoped via the active team; every /api/cad/* call binds auth.teamId.
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  Box, FileBox, ClipboardCheck, Layers, Package, Plus, Trash2, ExternalLink,
  Upload, X, MessageSquare, Check, RotateCcw, Hammer, Eye, AlertCircle,
  ChevronDown, Wrench, CircleDollarSign, Users, Clock, ArrowRight, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { apiFetch } from '../services/api';
import { notify, confirmDialog } from './dialog';
import { cn } from './onboarding/onboardingState';

const CadModelViewer = React.lazy(() => import('./CadModelViewer'));

export const CAD_SECTIONS = ['Intake', 'Outtake', 'Drivetrain', 'Chassis', 'End Game', 'Electronics', 'Other'];
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  concept: 'Concept', in_review: 'In Review', approved: 'Approved', changes_requested: 'Changes Requested', built: 'Built',
};
export const PART_SOURCE_LABELS: Record<string, string> = { printed: '3D Printed', purchased: 'Purchased', gobilda: 'goBILDA', other: 'Other' };
export const PART_STATUS_LABELS: Record<string, string> = { to_order: 'To Order', ordered: 'Ordered', received: 'Received', printed: 'Printed', installed: 'Installed' };

const STATUS_STYLES: Record<string, string> = {
  concept: 'bg-text-base/10 text-text-muted border-text-base/15',
  in_review: 'bg-info/15 text-info border-info/30',
  approved: 'bg-success/15 text-success border-success/30',
  changes_requested: 'bg-warning/15 text-warning border-warning/30',
  built: 'bg-accent/15 text-accent border-accent/30',
};

const SECTION_COLORS: Record<string, string> = {
  Intake: 'text-sky-300', Outtake: 'text-orange-300', Drivetrain: 'text-emerald-300',
  Chassis: 'text-violet-300', 'End Game': 'text-rose-300', Electronics: 'text-yellow-300', Other: 'text-text-muted',
};

// ---- local UI primitives (mirror App.tsx) ----
const Card = ({ children, className, title, subtitle, icon: Icon, action }: any) => (
  <div className={cn('card-surface p-6 flex flex-col gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)]', className)}>
    {(title || Icon) && (
      <div className="flex items-center justify-between mb-1 gap-3">
        <div className="min-w-0">
          {title && <h3 className="text-lg font-display font-bold text-text-base tracking-tight">{title}</h3>}
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {Icon && <div className="rounded-xl bg-accent/12 p-2.5"><Icon className="w-5 h-5 text-accent" /></div>}
        </div>
      </div>
    )}
    {children}
  </div>
);
const Button = ({ children, className, variant = 'primary', ...props }: any) => {
  const variants: any = {
    primary: 'bg-accent text-accent-ink font-bold hover:brightness-105 shadow-[0_4px_16px_rgba(255,199,0,0.25)]',
    secondary: 'bg-elevated text-text-base hover:bg-text-base/10 border border-text-base/10 font-semibold',
    ghost: 'text-text-muted hover:text-text-base hover:bg-text-base/5 font-semibold',
    danger: 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 border border-rose-500/30 font-semibold',
  };
  return <button className={cn('px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 text-sm', variants[variant], className)} {...props}>{children}</button>;
};
const Input = ({ className, ...props }: any) => (
  <input className={cn('w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm', className)} {...props} />
);
const TextArea = ({ className, ...props }: any) => (
  <textarea className={cn('w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm min-h-[90px]', className)} {...props} />
);
const Select = ({ className, options, ...props }: any) => (
  <select className={cn('w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm', className)} {...props}>
    {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
  </select>
);
const Field = ({ label, children }: any) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
    {children}
  </label>
);
const Badge = ({ className, children }: any) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', className)}>{children}</span>
);
const Modal = ({ title, onClose, children, wide }: any) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
    <div className={cn('card-surface p-6 w-full max-h-[90vh] overflow-y-auto', wide ? 'max-w-3xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-bold text-text-base">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10"><X className="w-5 h-5" /></button>
      </div>
      {children}
    </div>
  </div>
);
const Empty = ({ icon: Icon, title, hint }: any) => (
  <div className="text-center py-10 space-y-2">
    <Icon className="w-10 h-10 text-text-muted/50 mx-auto" />
    <p className="text-text-base font-semibold">{title}</p>
    {hint && <p className="text-sm text-text-muted">{hint}</p>}
  </div>
);
function fmtSize(bytes: any) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
function fmtDate(iso: any) {
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return ''; }
}

// ================= Dashboard =================
function CadDashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch('/api/cad/dashboard');
        if (r.ok) setData(await r.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="text-text-muted text-sm py-10 text-center">Loading CAD dashboard…</div>;
  if (!data) return <Empty icon={Box} title="Couldn't load the CAD dashboard" hint="Try refreshing the page." />;

  const stats = [
    { label: 'Onshape Docs', value: data.docsCount, icon: FileBox, path: '/cad-docs' },
    { label: 'Pending Reviews', value: data.pendingReviews, icon: ClipboardCheck, path: '/cad-reviews', alert: data.pendingReviews > 0 },
    { label: 'Snapshots', value: data.snapshotsCount, icon: Layers, path: '/cad-snapshots' },
    { label: 'Parts', value: data.partsCount, icon: Package, path: '/cad-parts', sub: `$${Number(data.partsTotalCost || 0).toFixed(2)} total` },
  ];
  const kindIcon: Record<string, any> = { review: ClipboardCheck, snapshot: Layers, part: Package, doc: FileBox };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <button key={s.label} onClick={() => onNavigate(s.path)} className="card-surface p-5 text-left hover:border-accent/40 transition-all group">
            <div className="flex items-center justify-between">
              <div className={cn('rounded-xl p-2.5', s.alert ? 'bg-warning/15' : 'bg-accent/12')}>
                <s.icon className={cn('w-5 h-5', s.alert ? 'text-warning' : 'text-accent')} />
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-3xl font-display font-bold text-text-base mt-3">{s.value}</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mt-1">{s.label}</p>
            {s.sub && <p className="text-xs text-text-muted mt-0.5">{s.sub}</p>}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Needs Attention" subtitle="Designs waiting for admin review" icon={AlertCircle}>
          {data.needsAttention?.length ? (
            <div className="space-y-2">
              {data.needsAttention.map((r: any) => (
                <button key={r.id} onClick={() => onNavigate('/cad-reviews')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-elevated border border-warning/25 hover:border-warning/50 transition-all text-left">
                  <ClipboardCheck className="w-4 h-4 text-warning shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-base truncate">{r.title}</p>
                    <p className="text-xs text-text-muted">{r.section}{r.author_name ? ` · ${r.author_name}` : ''} · waiting since {fmtDate(r.updated_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : <p className="text-sm text-text-muted">Nothing waiting — the review queue is clear.</p>}
        </Card>

        <Card title="Quick Actions" subtitle="Jump straight into CAD work" icon={Sparkles}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => onNavigate('/cad-docs')}><FileBox className="w-4 h-4" /> Link a doc</Button>
            <Button variant="secondary" onClick={() => onNavigate('/cad-reviews')}><ClipboardCheck className="w-4 h-4" /> Submit review</Button>
            <Button variant="secondary" onClick={() => onNavigate('/cad-snapshots')}><Upload className="w-4 h-4" /> Upload snapshot</Button>
            <Button variant="secondary" onClick={() => onNavigate('/cad-parts')}><Plus className="w-4 h-4" /> Add part</Button>
          </div>
        </Card>
      </div>

      <Card title="Recent Activity" subtitle="Latest CAD work across the team" icon={Clock}>
        {data.recent?.length ? (
          <div className="space-y-1">
            {data.recent.map((a: any, i: number) => {
              const Icon = kindIcon[a.kind] || Box;
              return (
                <div key={`${a.kind}-${a.id}-${i}`} className="flex items-center gap-3 py-2 border-b border-text-base/5 last:border-0">
                  <Icon className="w-4 h-4 text-accent/70 shrink-0" />
                  <p className="text-sm text-text-base truncate flex-1">{a.title}</p>
                  {a.section ? <span className="text-xs text-text-muted hidden sm:inline">{a.section}</span> : null}
                  <span className="text-xs text-text-muted/70 shrink-0">{fmtDate(a.ts)}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-text-muted">No CAD activity yet — link an Onshape doc to get started.</p>}
      </Card>
    </div>
  );
}

// ================= Onshape Docs =================
function CadDocs() {
  const [docs, setDocs] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await apiFetch('/api/cad/docs');
    if (r.ok) setDocs(await r.json());
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!name.trim() || !url.trim()) { notify('Give the document a name and URL.', 'error'); return; }
    setBusy(true);
    try {
      const r = await apiFetch('/api/cad/docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url }) });
      const d = await r.json();
      if (!r.ok) { notify(d.error || 'Could not link the document.', 'error'); return; }
      setName(''); setUrl(''); await load(); notify('Onshape doc linked.', 'success');
    } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Unlink document?', message: 'This removes the link for the whole team.', confirmLabel: 'Unlink' }))) return;
    const r = await apiFetch(`/api/cad/docs/${id}`, { method: 'DELETE' });
    if (r.ok) { setDocs((p) => p.filter((d) => d.id !== id)); notify('Document unlinked.', 'success'); }
    else notify('Could not unlink.', 'error');
  };
  return (
    <div className="space-y-4">
      <Card title="Link Onshape Document" subtitle="One shared home for every CAD document the team uses" icon={FileBox}>
        <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3">
          <Input placeholder="Document name (e.g. 2026 Robot Assembly)" value={name} onChange={(e: any) => setName(e.target.value)} />
          <Input placeholder="https://cad.onshape.com/documents/…" value={url} onChange={(e: any) => setUrl(e.target.value)} />
          <Button onClick={add} disabled={busy}><Plus className="w-4 h-4" /> Link</Button>
        </div>
      </Card>
      <Card title="Team Documents" subtitle={`${docs.length} linked`} icon={FileBox}>
        {docs.length ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-4 rounded-xl bg-elevated border border-text-base/10 hover:border-accent/40 transition-all">
                <div className="rounded-xl bg-accent/12 p-2.5 shrink-0"><FileBox className="w-5 h-5 text-accent" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-base truncate">{d.name}</p>
                  <p className="text-xs text-text-muted">Linked {fmtDate(d.created_at)}</p>
                </div>
                <a href={d.url} target="_blank" rel="noreferrer" className="p-2 rounded-xl text-accent hover:bg-accent/10" title="Open in Onshape">
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button onClick={() => remove(d.id)} className="p-2 rounded-xl text-text-muted hover:text-rose-400 hover:bg-rose-500/10" title="Unlink">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : <Empty icon={FileBox} title="No Onshape docs linked yet" hint="Paste a document link above — the whole team will see it here." />}
      </Card>
    </div>
  );
}

// ================= Design Reviews =================
function CadReviews({ currentUser, isAdmin }: { currentUser?: any; isAdmin: boolean }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const load = async () => {
    const r = await apiFetch('/api/cad/reviews');
    if (r.ok) setReviews(await r.json());
  };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => filter === 'all' ? reviews : reviews.filter((r) => r.status === filter), [reviews, filter]);

  const setStatus = async (id: number, status: string) => {
    const r = await apiFetch(`/api/cad/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { notify(d.error || 'Status change failed.', 'error'); return; }
    setReviews((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    notify(`Marked as ${REVIEW_STATUS_LABELS[status]}.`, 'success');
  };
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete review?', message: 'This removes the review and its comments.', confirmLabel: 'Delete' }))) return;
    const r = await apiFetch(`/api/cad/reviews/${id}`, { method: 'DELETE' });
    if (r.ok) { setReviews((p) => p.filter((x) => x.id !== id)); notify('Review deleted.', 'success'); }
    else notify('Could not delete.', 'error');
  };
  const canAct = (review: any, to: string) => {
    if (review.status === to || review.status === 'built') return false;
    if (isAdmin) return true;
    const isAuthor = review.created_by === currentUser?.id;
    if (!isAuthor) return false;
    return (review.status === 'concept' && to === 'in_review') || (review.status === 'changes_requested' && to === 'in_review');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {['all', 'concept', 'in_review', 'approved', 'changes_requested', 'built'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
              filter === s ? 'bg-accent text-accent-ink border-accent' : 'border-text-base/10 text-text-muted hover:text-text-base hover:bg-text-base/5')}>
            {s === 'all' ? 'All' : REVIEW_STATUS_LABELS[s]}
          </button>
        ))}
        <div className="flex-1" />
        <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Submit Design</Button>
      </div>

      {visible.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map((r) => (
            <Card key={r.id} className="!p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-text-base font-bold truncate">{r.title}</h4>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    <span className={cn('font-semibold', SECTION_COLORS[r.section] || 'text-text-muted')}>{r.section}</span>
                    {r.author_name ? ` · ${r.author_name}` : ''} · {fmtDate(r.created_at)}
                  </p>
                </div>
                <Badge className={STATUS_STYLES[r.status]}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
              </div>
              {r.screenshot_url && <img src={r.screenshot_url} alt="" className="rounded-xl border border-text-base/10 max-h-48 w-full object-cover" />}
              {r.description && <p className="text-sm text-text-muted line-clamp-3 whitespace-pre-wrap">{r.description}</p>}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {r.onshape_url && <a href={r.onshape_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Open in Onshape</a>}
                <span className="text-xs text-text-muted inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {r.comment_count || 0}</span>
                <div className="flex-1" />
                <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  {openId === r.id ? 'Hide' : 'Details'} <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', openId === r.id && 'rotate-180')} />
                </Button>
              </div>
              {openId === r.id && (
                <ReviewDetail review={r} isAdmin={isAdmin} canAct={canAct} onStatus={setStatus} onDelete={() => remove(r.id)} onChanged={load} />
              )}
            </Card>
          ))}
        </div>
      ) : <Card><Empty icon={ClipboardCheck} title="No designs here yet" hint="Submit the first design for review — nothing gets built off an unreviewed design." /></Card>}

      {showForm && <ReviewForm onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function ReviewForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('Intake');
  const [onshapeUrl, setOnshapeUrl] = useState('');
  const [description, setDescription] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) { notify('Give the design a title.', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('section', section);
      fd.append('onshape_url', onshapeUrl.trim());
      fd.append('description', description.trim());
      if (shot) fd.append('screenshot', shot);
      const r = await apiFetch('/api/cad/reviews', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Could not submit the design.', 'error'); return; }
      notify('Design submitted for review.', 'success');
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Submit Design for Review" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Title"><Input placeholder="Intake v3 — dual roller" value={title} onChange={(e: any) => setTitle(e.target.value)} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Subsystem">
            <Select value={section} onChange={(e: any) => setSection(e.target.value)} options={CAD_SECTIONS.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Onshape Link">
            <Input placeholder="https://cad.onshape.com/documents/…" value={onshapeUrl} onChange={(e: any) => setOnshapeUrl(e.target.value)} />
          </Field>
        </div>
        <Field label="Screenshot (optional)">
          <input type="file" accept="image/*" onChange={(e: any) => setShot(e.target.files?.[0] || null)}
            className="w-full text-sm text-text-muted file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-elevated file:text-text-base file:font-semibold hover:file:bg-text-base/10" />
        </Field>
        <Field label="Description"><TextArea placeholder="What changed, what needs eyes on it…" value={description} onChange={(e: any) => setDescription(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}><Check className="w-4 h-4" /> Submit</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReviewDetail({ review, isAdmin, canAct, onStatus, onDelete, onChanged }: any) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const load = async () => {
    const r = await apiFetch(`/api/cad/reviews/${review.id}/comments`);
    if (r.ok) setComments(await r.json());
  };
  useEffect(() => { load(); }, []);
  const send = async () => {
    if (!text.trim()) return;
    const r = await apiFetch(`/api/cad/reviews/${review.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: text.trim() }) });
    if (r.ok) { setText(''); await load(); onChanged(); }
  };
  const actions: { to: string; label: string; icon: any; primary?: boolean }[] = [];
  if (canAct(review, 'in_review')) actions.push({ to: 'in_review', label: review.status === 'concept' ? 'Submit for Review' : 'Re-submit for Review', icon: Eye, primary: true });
  if (canAct(review, 'approved')) actions.push({ to: 'approved', label: 'Approve', icon: Check, primary: true });
  if (canAct(review, 'changes_requested')) actions.push({ to: 'changes_requested', label: 'Request Changes', icon: RotateCcw });
  if (canAct(review, 'built')) actions.push({ to: 'built', label: 'Mark Built', icon: Hammer });

  return (
    <div className="border-t border-text-base/10 pt-3 space-y-3">
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.to} variant={a.primary ? 'primary' : 'secondary'} className="!text-xs !py-1.5" onClick={() => onStatus(review.id, a.to)}>
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </Button>
          ))}
          {(isAdmin) && (
            <Button variant="danger" className="!text-xs !py-1.5 !px-3" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
          )}
        </div>
      )}
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl bg-elevated border border-text-base/10 p-3">
            <p className="text-xs font-bold text-accent">{c.author_name || 'Member'} <span className="text-text-muted/60 font-normal">· {fmtDate(c.created_at)}</span></p>
            <p className="text-sm text-text-base/90 mt-1 whitespace-pre-wrap">{c.comment}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-xs text-text-muted">No comments yet — start the discussion.</p>}
        <div className="flex gap-2">
          <Input placeholder="Add a comment…" value={text} onChange={(e: any) => setText(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') send(); }} />
          <Button variant="secondary" onClick={send} disabled={!text.trim()}>Send</Button>
        </div>
      </div>
    </div>
  );
}

// ================= Snapshots =================
function CadSnapshots({ currentUser, isAdmin }: { currentUser?: any; isAdmin: boolean }) {
  const [snaps, setSnaps] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [viewer, setViewer] = useState<any>(null);
  const load = async () => {
    const r = await apiFetch('/api/cad/snapshots');
    if (r.ok) setSnaps(await r.json());
  };
  useEffect(() => { load(); }, []);
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of snaps) { (g[s.section] = g[s.section] || []).push(s); }
    return CAD_SECTIONS.filter((s) => g[s]).map((s) => ({ section: s, items: g[s] }));
  }, [snaps]);
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete snapshot?', message: 'The 3D file is removed for everyone.', confirmLabel: 'Delete' }))) return;
    const r = await apiFetch(`/api/cad/snapshots/${id}`, { method: 'DELETE' });
    if (r.ok) { setSnaps((p) => p.filter((x) => x.id !== id)); notify('Snapshot deleted.', 'success'); }
    else notify('Could not delete.', 'error');
  };
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)}><Upload className="w-4 h-4" /> Upload Snapshot</Button>
      </div>
      {grouped.length ? grouped.map(({ section, items }) => (
        <Card key={section} title={section} subtitle={`${items.length} snapshot${items.length === 1 ? '' : 's'}`} icon={Layers}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((s) => (
              <div key={s.id} className="rounded-2xl bg-elevated border border-text-base/10 overflow-hidden hover:border-accent/40 transition-all group">
                {s.screenshot_url ? (
                  <img src={s.screenshot_url} alt="" className="w-full h-40 object-cover" />
                ) : (
                  <button onClick={() => setViewer(s)} className="w-full h-40 flex flex-col items-center justify-center gap-2 bg-text-base/[0.03] hover:bg-accent/5 transition-all">
                    <Box className="w-10 h-10 text-accent/60 group-hover:text-accent group-hover:scale-110 transition-all" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Click to view 3D</span>
                  </button>
                )}
                <div className="p-4 space-y-2">
                  <p className="text-sm font-bold text-text-base truncate">{s.title}</p>
                  <p className="text-xs text-text-muted flex items-center gap-2">
                    <Badge className="bg-text-base/10 text-text-muted border-text-base/15">{s.file_type.toUpperCase()}</Badge>
                    {fmtSize(s.file_size)}
                    {s.author_name ? ` · ${s.author_name}` : ''}
                  </p>
                  {s.notes && <p className="text-xs text-text-muted line-clamp-2">{s.notes}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="!text-xs !py-1.5 flex-1" onClick={() => setViewer(s)}>
                      <Eye className="w-3.5 h-3.5" /> View 3D
                    </Button>
                    {(isAdmin || s.created_by === currentUser?.id) && (
                      <Button variant="danger" className="!text-xs !py-1.5 !px-3" onClick={() => remove(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )) : <Card><Empty icon={Layers} title="No snapshots yet" hint="Upload a STEP or STL export — the team can orbit around it right here." /></Card>}

      {showForm && <SnapshotForm onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}

      {viewer && (
        <Suspense fallback={<div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center text-text-muted text-sm">Loading 3D viewer…</div>}>
          <CadModelViewer fileUrl={viewer.file_url} fileType={viewer.file_type} fileName={viewer.file_name || viewer.title} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </div>
  );
}

function SnapshotForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('Intake');
  const [model, setModel] = useState<File | null>(null);
  const [shot, setShot] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!model) { notify('Choose a STEP or STL file.', 'error'); return; }
    const ok = /\.(step|stp|stl)$/i.test(model.name);
    if (!ok) { notify('Model must be .step/.stp or .stl.', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('model', model);
      if (shot) fd.append('screenshot', shot);
      fd.append('title', title.trim() || model.name);
      fd.append('section', section);
      fd.append('notes', notes.trim());
      const r = await apiFetch('/api/cad/snapshots', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Upload failed.', 'error'); return; }
      notify('Snapshot uploaded.', 'success');
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Upload Design Snapshot" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Title"><Input placeholder="Intake v3 milestone" value={title} onChange={(e: any) => setTitle(e.target.value)} /></Field>
          <Field label="Subsystem">
            <Select value={section} onChange={(e: any) => setSection(e.target.value)} options={CAD_SECTIONS.map((s) => ({ value: s, label: s }))} />
          </Field>
        </div>
        <Field label="3D Model (.step / .stp / .stl)">
          <input type="file" accept=".step,.stp,.stl" onChange={(e: any) => setModel(e.target.files?.[0] || null)}
            className="w-full text-sm text-text-muted file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-elevated file:text-text-base file:font-semibold hover:file:bg-text-base/10" />
          {model && <p className="text-xs text-text-muted">{model.name} · {fmtSize(model.size)}</p>}
        </Field>
        <Field label="Screenshot (optional)">
          <input type="file" accept="image/*" onChange={(e: any) => setShot(e.target.files?.[0] || null)}
            className="w-full text-sm text-text-muted file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-elevated file:text-text-base file:font-semibold hover:file:bg-text-base/10" />
        </Field>
        <Field label="Notes"><TextArea placeholder="What does this snapshot capture?" value={notes} onChange={(e: any) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}><Upload className="w-4 h-4" /> Upload</Button>
        </div>
      </div>
    </Modal>
  );
}

// ================= Parts / BOM =================
function CadParts() {
  const [parts, setParts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const load = async () => {
    const r = await apiFetch('/api/cad/parts');
    if (r.ok) setParts(await r.json());
  };
  useEffect(() => { load(); }, []);
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const p of parts) { (g[p.section] = g[p.section] || []).push(p); }
    return CAD_SECTIONS.filter((s) => g[s]).map((s) => ({ section: s, items: g[s] }));
  }, [parts]);
  const total = parts.reduce((a, p) => a + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);
  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete part?', message: 'Removes it from the BOM.', confirmLabel: 'Delete' }))) return;
    const r = await apiFetch(`/api/cad/parts/${id}`, { method: 'DELETE' });
    if (r.ok) { setParts((p) => p.filter((x) => x.id !== id)); notify('Part deleted.', 'success'); }
    else notify('Could not delete.', 'error');
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted flex items-center gap-2">
          <CircleDollarSign className="w-4 h-4 text-accent" />
          <span className="font-bold text-text-base text-base">${total.toFixed(2)}</span> total BOM cost · {parts.length} parts
        </p>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Part</Button>
      </div>
      {grouped.length ? grouped.map(({ section, items }) => (
        <Card key={section} title={section} subtitle={`${items.length} parts`} icon={Package}>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-text-muted border-b border-text-base/10">
                  <th className="py-2 pr-3 font-bold">Part</th>
                  <th className="py-2 pr-3 font-bold">Qty</th>
                  <th className="py-2 pr-3 font-bold">Source</th>
                  <th className="py-2 pr-3 font-bold">Unit</th>
                  <th className="py-2 pr-3 font-bold">Total</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Assignee</th>
                  <th className="py-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-text-base/5 last:border-0 hover:bg-text-base/[0.02]">
                    <td className="py-2.5 pr-3 font-semibold text-text-base">{p.name}</td>
                    <td className="py-2.5 pr-3 text-text-muted">{p.quantity}</td>
                    <td className="py-2.5 pr-3"><Badge className="bg-text-base/10 text-text-muted border-text-base/15">{PART_SOURCE_LABELS[p.source] || p.source}</Badge></td>
                    <td className="py-2.5 pr-3 text-text-muted">${Number(p.unit_cost).toFixed(2)}</td>
                    <td className="py-2.5 pr-3 text-text-base font-semibold">${(p.quantity * p.unit_cost).toFixed(2)}</td>
                    <td className="py-2.5 pr-3"><Badge className={cn('border', p.status === 'installed' ? 'bg-success/15 text-success border-success/30' : p.status === 'to_order' ? 'bg-warning/15 text-warning border-warning/30' : 'bg-info/15 text-info border-info/30')}>{PART_STATUS_LABELS[p.status] || p.status}</Badge></td>
                    <td className="py-2.5 pr-3 text-text-muted">{p.assignee || '—'}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10" title="Edit"><Wrench className="w-4 h-4" /></button>
                      <button onClick={() => remove(p.id)} className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )) : <Card><Empty icon={Package} title="BOM is empty" hint="Add every part the robot needs — printed, purchased, or goBILDA." /></Card>}

      {showForm && <PartForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onDone={() => { setShowForm(false); setEditing(null); load(); }} />}
    </div>
  );
}

function PartForm({ initial, onClose, onDone }: { initial?: any; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [section, setSection] = useState(initial?.section || 'Intake');
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [source, setSource] = useState(initial?.source || 'purchased');
  const [unitCost, setUnitCost] = useState(String(initial?.unit_cost ?? 0));
  const [status, setStatus] = useState(initial?.status || 'to_order');
  const [assignee, setAssignee] = useState(initial?.assignee || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) { notify('Part name is required.', 'error'); return; }
    setBusy(true);
    try {
      const body = { name: name.trim(), section, quantity: Number(quantity) || 1, source, unit_cost: Number(unitCost) || 0, status, assignee: assignee.trim(), notes: notes.trim() };
      const r = await apiFetch(initial ? `/api/cad/parts/${initial.id}` : '/api/cad/parts', {
        method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify(d.error || 'Could not save the part.', 'error'); return; }
      notify(initial ? 'Part updated.' : 'Part added.', 'success');
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal title={initial ? 'Edit Part' : 'Add Part'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Part Name"><Input placeholder="goBILDA 96mm omni wheel" value={name} onChange={(e: any) => setName(e.target.value)} /></Field>
          <Field label="Subsystem">
            <Select value={section} onChange={(e: any) => setSection(e.target.value)} options={CAD_SECTIONS.map((s) => ({ value: s, label: s }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Qty"><Input type="number" min={1} value={quantity} onChange={(e: any) => setQuantity(e.target.value)} /></Field>
          <Field label="Source">
            <Select value={source} onChange={(e: any) => setSource(e.target.value)} options={Object.entries(PART_SOURCE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Unit Cost ($)"><Input type="number" min={0} step="0.01" value={unitCost} onChange={(e: any) => setUnitCost(e.target.value)} /></Field>
          <Field label="Status">
            <Select value={status} onChange={(e: any) => setStatus(e.target.value)} options={Object.entries(PART_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Field>
        </div>
        <Field label="Assignee"><Input placeholder="Who's responsible" value={assignee} onChange={(e: any) => setAssignee(e.target.value)} /></Field>
        <Field label="Notes"><TextArea placeholder="Link, specs, print settings…" value={notes} onChange={(e: any) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}><Check className="w-4 h-4" /> {initial ? 'Save' : 'Add Part'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ================= Main view =================
const SUBTABS = [
  { id: 'cad', label: 'Dashboard', icon: Box },
  { id: 'cad-docs', label: 'Onshape Docs', icon: FileBox },
  { id: 'cad-reviews', label: 'Design Reviews', icon: ClipboardCheck },
  { id: 'cad-snapshots', label: 'Snapshots', icon: Layers },
  { id: 'cad-parts', label: 'Parts List', icon: Package },
];

export function CadView({ activeTab, currentUser, isAdmin }: { activeTab: string; currentUser?: any; isAdmin: boolean }) {
  const navigate = useNavigate();
  const tab = SUBTABS.some((t) => t.id === activeTab) ? activeTab : 'cad';
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-text-base tracking-tight flex items-center gap-2">
          <Box className="w-6 h-6 text-accent" /> CAD
        </h2>
        <p className="text-sm text-text-muted mt-1">Designs, reviews, 3D snapshots, and the bill of materials — one home for the CAD team.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SUBTABS.map((t) => (
          <button key={t.id} onClick={() => navigate(`/${t.id}`)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all whitespace-nowrap',
              tab === t.id ? 'bg-accent text-accent-ink border-accent' : 'border-text-base/10 text-text-muted hover:text-text-base hover:bg-text-base/5')}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'cad' && <CadDashboard onNavigate={(p) => navigate(p)} />}
      {tab === 'cad-docs' && <CadDocs />}
      {tab === 'cad-reviews' && <CadReviews currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === 'cad-snapshots' && <CadSnapshots currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === 'cad-parts' && <CadParts />}
    </div>
  );
}
