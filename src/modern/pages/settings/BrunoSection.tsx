// Settings → Bruno AI: teaching mode and output length (saved on your member
// row, so they follow you), answer style (this device), FTC coding
// preferences (this device) and — for the one team that has it — the
// NavGPT ❤️ persona.
import { useState } from 'react';
import { BookOpen, ChevronDown, GraduationCap, Heart, StickyNote, Sun } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Switch, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { confirmDialog, notify } from '../../../components/dialog';
import { BRUNO_PREF_KEYS as K, navGptQualifies, useBoolPref, useStringPref } from '../../../components/settings/prefs';
import { SettingsGroup, SettingsRow } from './SettingsPage';
import { BrunoMemoryGroup } from './BrunoMemory';

export function BrunoSection({ currentUser, teams = [], isAdmin, onUserSaved, onTeamSaved }: any) {
  const user = currentUser || {};
  const team = teams.find((t: any) => t.id === user.team_id);
  const [teach, setTeach] = useState(user.bruno_teach_mode === 1);
  const [nudges, setNudges] = useState(user.bruno_nudges !== 0);
  const [notebookAccess, setNotebookAccess] = useState(user.bruno_notebook !== 0);
  const [stickyAccess, setStickyAccess] = useState(user.bruno_sticky !== 0);
  const [level, setLevel] = useState<string>(user.bruno_output_level === 'max' ? 'high' : (user.bruno_output_level || 'medium'));
  // One in-flight lock per control (as Legacy tracks teach/level/persona
  // separately), so a save of one never unlocks another mid-request.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const lock = (k: string, on: boolean) => setBusy((b) => ({ ...b, [k]: on }));
  const [explanation, setExplanation] = useStringPref(K.explanationStyle, 'balanced');
  const [format, setFormat] = useStringPref(K.responseFormat, 'detailed');
  const [autoExplain, setAutoExplain] = useBoolPref(K.autoExplain, true);
  const [confirmChanges, setConfirmChanges] = useBoolPref(K.confirmChanges, true);
  const [remember, setRemember] = useBoolPref(K.rememberPrefs, true);
  const [opmode, setOpmode] = useStringPref(K.opmodeStyle, 'linear');
  const [indent, setIndent] = useStringPref(K.indent, '4');
  const [comments, setComments] = useBoolPref(K.comments, true);
  const [beginner, setBeginner] = useBoolPref(K.beginnerComments, false);
  const [warnHw, setWarnHw] = useBoolPref(K.warnHardware, true);
  const [warnRev, setWarnRev] = useBoolPref(K.warnReversed, true);
  const [warnPower, setWarnPower] = useBoolPref(K.warnPower, true);
  const [warnBlock, setWarnBlock] = useBoolPref(K.warnBlocking, true);
  const [codingOpen, setCodingOpen] = useState(false);

  /** Optimistic member-row save with revert, same body as the Legacy modal. */
  const saveProfile = async (key: string, patch: Record<string, unknown>, revert: () => void, ok: string) => {
    lock(key, true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name || '', role: user.role || '', ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) { onUserSaved?.(data.user); notify(ok, 'success'); }
      else { revert(); notify(data.error || 'Could not save.', 'error'); }
    } catch {
      revert();
      notify('Could not save.', 'error');
    } finally {
      lock(key, false);
    }
  };

  const toggleTeach = (next: boolean) => {
    if (busy.teach) return;
    setTeach(next);
    void saveProfile('teach', { bruno_teach_mode: next ? 1 : 0 }, () => setTeach(!next),
      next ? 'Teaching mode on — Bruno will walk you through it.' : 'Teaching mode off — Bruno will write the code for you.');
  };
  const changeLevel = (next: string) => {
    // One save at a time (as in the Legacy modal), so replies can't land out of order.
    if (!next || next === level || busy.level) return;
    const prev = level;
    setLevel(next);
    void saveProfile('level', { bruno_output_level: next }, () => setLevel(prev), `Output length: ${next}.`);
  };

  const qualifies = isAdmin && navGptQualifies(team?.name);
  const navGptOn = navGptQualifies(team?.name) && (team?.navgpt_enabled ?? 1) === 1;
  const togglePersona = async () => {
    if (busy.persona) return;
    if (navGptOn && !(await confirmDialog({
      title: 'Turn off NavGPT ❤️?',
      message: 'The team chatbot will go back to being Bruno — the normal persona. You can switch back to NavGPT ❤️ anytime.',
      confirmLabel: 'Turn off', cancelLabel: 'Keep NavGPT ❤️', danger: true,
    }))) return;
    lock('persona', true);
    try {
      const res = await apiFetch('/api/team/chat-persona', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !navGptOn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update persona');
      onTeamSaved?.({ ...team, navgpt_enabled: data.navgpt_enabled ? 1 : 0 });
      notify(navGptOn ? 'NavGPT ❤️ is off — the chatbot is Bruno again.' : 'NavGPT ❤️ is on.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not update persona', 'error');
    } finally {
      lock('persona', false);
    }
  };

  const seg = (value: string, onChange: (v: string) => void, opts: [string, string][], label: string, disabled?: boolean) => (
    <ToggleGroup type="single" value={value} disabled={disabled} onValueChange={(v) => { if (v) onChange(v); }} aria-label={label} className="flex-wrap justify-start">
      {opts.map(([v, l]) => <ToggleGroupItem key={v} value={v}>{l}</ToggleGroupItem>)}
    </ToggleGroup>
  );

  return (
    <div>
      <SettingsGroup title="How Bruno helps you" description="Saved to your account, on every device.">
        <SettingsRow label="Teaching mode" description="Bruno explains and guides you to write the code yourself instead of handing it over." htmlFor="bruno-teach">
          <span className="flex items-center gap-2"><GraduationCap className={cn('size-4', teach ? 'text-accent' : 'text-muted-foreground')} /><Switch id="bruno-teach" checked={teach} disabled={!!busy.teach} onCheckedChange={toggleTeach} /></span>
        </SettingsRow>
        <SettingsRow label="Answer length" description="Longer answers use more AI tokens — typically only a few dollars a month for a team.">
          {seg(level, changeLevel, [['low', 'Short'], ['medium', 'Medium'], ['high', 'Long']], 'Output length', !!busy.level)}
        </SettingsRow>
        <SettingsRow label="Morning summary" description="At 8 AM, one note in your Inbox when you have tasks due today or overdue (and, for managers, unassigned team tasks). Nothing to report, no note." htmlFor="bruno-nudges">
          <span className="flex items-center gap-2"><Sun className={cn('size-4', nudges ? 'text-accent' : 'text-muted-foreground')} /><Switch id="bruno-nudges" checked={nudges} disabled={!!busy.nudges} onCheckedChange={(next) => {
            if (busy.nudges) return;
            setNudges(next);
            void saveProfile('nudges', { bruno_nudges: next }, () => setNudges(!next), next ? 'Morning summary on.' : 'Morning summary off.');
          }} /></span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="What Bruno can use" description="Saved to your account. Bruno never sees admin-only notebook pages either way.">
        <SettingsRow label="Team notebook" description="Bruno can read notebook pages you can see and propose edits you confirm." htmlFor="bruno-notebook">
          <span className="flex items-center gap-2"><BookOpen className={cn('size-4', notebookAccess ? 'text-accent' : 'text-muted-foreground')} /><Switch id="bruno-notebook" checked={notebookAccess} disabled={!!busy.notebook} onCheckedChange={(next) => {
            if (busy.notebook) return;
            setNotebookAccess(next);
            void saveProfile('notebook', { bruno_notebook: next }, () => setNotebookAccess(!next), next ? 'Bruno can use the notebook.' : 'Bruno’s notebook access is off.');
          }} /></span>
        </SettingsRow>
        <SettingsRow label="My sticky notes" description="Bruno can read your own sticky notes and propose new notes or edits you confirm. Nobody else's notes, ever." htmlFor="bruno-sticky">
          <span className="flex items-center gap-2"><StickyNote className={cn('size-4', stickyAccess ? 'text-accent' : 'text-muted-foreground')} /><Switch id="bruno-sticky" checked={stickyAccess} disabled={!!busy.sticky} onCheckedChange={(next) => {
            if (busy.sticky) return;
            setStickyAccess(next);
            void saveProfile('sticky', { bruno_sticky: next }, () => setStickyAccess(!next), next ? 'Bruno can use your sticky notes.' : 'Bruno’s sticky notes access is off.');
          }} /></span>
        </SettingsRow>
      </SettingsGroup>

      <BrunoMemoryGroup />

      <SettingsGroup title="Answer style" description="On this device.">
        <SettingsRow label="Explanations" description="How technical Bruno’s explanations are." stack>
          {seg(explanation, setExplanation, [['beginner', 'Beginner-friendly'], ['balanced', 'Balanced'], ['technical', 'Technical']], 'Explanation style')}
        </SettingsRow>
        <SettingsRow label="Format" description="How Bruno structures answers by default." stack>
          {seg(format, setFormat, [['concise', 'Concise'], ['detailed', 'Detailed'], ['step-by-step', 'Step-by-step'], ['code-first', 'Code-first']], 'Response format')}
        </SettingsRow>
        <SettingsRow label="Auto-explain code" description="Explain unfamiliar code snippets automatically." htmlFor="bruno-auto"><Switch id="bruno-auto" checked={autoExplain} onCheckedChange={setAutoExplain} /></SettingsRow>
        <SettingsRow label="Confirm before changes" description="Ask before changing tasks, notes or robot code." htmlFor="bruno-confirm"><Switch id="bruno-confirm" checked={confirmChanges} onCheckedChange={setConfirmChanges} /></SettingsRow>
        <SettingsRow label="Remember preferences" description="Bruno remembers your style and coding habits." htmlFor="bruno-remember"><Switch id="bruno-remember" checked={remember} onCheckedChange={setRemember} /></SettingsRow>
      </SettingsGroup>

      <Collapsible open={codingOpen} onOpenChange={setCodingOpen}>
        <section className="mb-8 rounded-xl border border-border bg-card">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left">
              <span>
                <span className="block text-sm font-semibold">FTC coding preferences</span>
                <span className="block text-sm text-muted-foreground">How Bruno writes robot code for you, on this device.</span>
              </span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', codingOpen && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border">
              <SettingsRow label="Language" description="Managed by your team administrator."><span className="text-sm">Java</span></SettingsRow>
              <SettingsRow label="OpMode style" stack>{seg(opmode, setOpmode, [['linear', 'LinearOpMode'], ['opmode', 'Iterative OpMode'], ['ask', 'Ask each time']], 'OpMode style')}</SettingsRow>
              <SettingsRow label="Indentation">{seg(indent, setIndent, [['2', '2 spaces'], ['4', '4 spaces']], 'Indentation')}</SettingsRow>
              <SettingsRow label="Include comments" htmlFor="ftc-comments"><Switch id="ftc-comments" checked={comments} onCheckedChange={setComments} /></SettingsRow>
              <SettingsRow label="Beginner-friendly comments" htmlFor="ftc-beginner"><Switch id="ftc-beginner" checked={beginner} onCheckedChange={setBeginner} /></SettingsRow>
              <SettingsRow label="Warn about missing hardware mapping" htmlFor="ftc-hw"><Switch id="ftc-hw" checked={warnHw} onCheckedChange={setWarnHw} /></SettingsRow>
              <SettingsRow label="Warn about reversed motors" htmlFor="ftc-rev"><Switch id="ftc-rev" checked={warnRev} onCheckedChange={setWarnRev} /></SettingsRow>
              <SettingsRow label="Warn about unsafe motor power" htmlFor="ftc-power"><Switch id="ftc-power" checked={warnPower} onCheckedChange={setWarnPower} /></SettingsRow>
              <SettingsRow label="Warn about blocking loops" htmlFor="ftc-block"><Switch id="ftc-block" checked={warnBlock} onCheckedChange={setWarnBlock} /></SettingsRow>
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {qualifies && (
        <SettingsGroup title="Chatbot persona">
          <SettingsRow label="NavGPT ❤️" description="Your team’s chatbot persona. Off means everyone talks to Bruno." htmlFor="navgpt">
            <span className="flex items-center gap-2"><Heart className={cn('size-4', navGptOn ? 'fill-destructive text-destructive' : 'text-muted-foreground')} /><Switch id="navgpt" checked={navGptOn} disabled={!!busy.persona} onCheckedChange={() => void togglePersona()} /></span>
          </SettingsRow>
        </SettingsGroup>
      )}
    </div>
  );
}
