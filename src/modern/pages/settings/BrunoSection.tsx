// Settings → Bruno AI: teaching mode and output length (saved on your member
// row, so they follow you), answer style (this device), FTC coding
// preferences (this device) and — for the one team that has it — the
// NavGPT ❤️ persona.
import { useState } from 'react';
import { ChevronDown, GraduationCap, Heart } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Switch, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { confirmDialog, notify } from '../../../components/dialog';
import { BRUNO_PREF_KEYS as K, navGptQualifies, useBoolPref, useStringPref } from '../../../components/settings/prefs';
import { SettingsGroup, SettingsRow } from './SettingsPage';

export function BrunoSection({ currentUser, teams = [], isAdmin, onUserSaved, onTeamSaved }: any) {
  const user = currentUser || {};
  const team = teams.find((t: any) => t.id === user.team_id);
  const [teach, setTeach] = useState(user.bruno_teach_mode === 1);
  const [level, setLevel] = useState<string>(user.bruno_output_level === 'max' ? 'high' : (user.bruno_output_level || 'medium'));
  const [busy, setBusy] = useState<string | null>(null);
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
    setBusy(key);
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
      setBusy(null);
    }
  };

  const toggleTeach = (next: boolean) => {
    setTeach(next);
    void saveProfile('teach', { bruno_teach_mode: next ? 1 : 0 }, () => setTeach(!next),
      next ? 'Teaching mode on — Bruno will walk you through it.' : 'Teaching mode off — Bruno will write the code for you.');
  };
  const changeLevel = (next: string) => {
    if (!next || next === level) return;
    const prev = level;
    setLevel(next);
    void saveProfile('level', { bruno_output_level: next }, () => setLevel(prev), `Output length: ${next}.`);
  };

  const qualifies = isAdmin && navGptQualifies(team?.name);
  const navGptOn = navGptQualifies(team?.name) && (team?.navgpt_enabled ?? 1) === 1;
  const togglePersona = async () => {
    if (busy) return;
    if (navGptOn && !(await confirmDialog({
      title: 'Turn off NavGPT ❤️?',
      message: 'The team chatbot will go back to being Bruno — the normal persona. You can switch back to NavGPT ❤️ anytime.',
      confirmLabel: 'Turn off', cancelLabel: 'Keep NavGPT ❤️', danger: true,
    }))) return;
    setBusy('persona');
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
      setBusy(null);
    }
  };

  const seg = (value: string, onChange: (v: string) => void, opts: [string, string][], label: string) => (
    <ToggleGroup type="single" value={value} onValueChange={(v) => { if (v) onChange(v); }} aria-label={label} className="flex-wrap justify-start">
      {opts.map(([v, l]) => <ToggleGroupItem key={v} value={v} className="px-3 max-sm:h-10">{l}</ToggleGroupItem>)}
    </ToggleGroup>
  );

  return (
    <div>
      <SettingsGroup title="How Bruno helps you" description="Saved to your account, on every device.">
        <SettingsRow label="Teaching mode" description="Bruno explains and guides you to write the code yourself instead of handing it over." htmlFor="bruno-teach">
          <span className="flex items-center gap-2"><GraduationCap className={cn('size-4', teach ? 'text-accent' : 'text-muted-foreground')} /><Switch id="bruno-teach" checked={teach} disabled={busy === 'teach'} onCheckedChange={toggleTeach} /></span>
        </SettingsRow>
        <SettingsRow label="Answer length" description="Longer answers use more AI tokens — typically only a few dollars a month for a team.">
          {seg(level, changeLevel, [['low', 'Short'], ['medium', 'Medium'], ['high', 'Long']], 'Output length')}
        </SettingsRow>
      </SettingsGroup>

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
            <span className="flex items-center gap-2"><Heart className={cn('size-4', navGptOn ? 'fill-destructive text-destructive' : 'text-muted-foreground')} /><Switch id="navgpt" checked={navGptOn} disabled={busy === 'persona'} onCheckedChange={() => void togglePersona()} /></span>
          </SettingsRow>
        </SettingsGroup>
      )}
    </div>
  );
}
