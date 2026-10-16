// Settings → Workspace: which modules the team uses, and its robot
// subsystems. Admins edit both; everyone else sees them read-only.
// Switching a module off only hides it: its data stays and comes back.
import { useEffect, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { Button, Input, Switch } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';
import { SettingsGroup, SettingsRow } from './SettingsPage';
import {
  DEFAULT_SUBSYSTEMS, MAX_SUBSYSTEM_LENGTH, MAX_SUBSYSTEMS, TEAM_MODULES,
  cleanSubsystems, parseDisabledModules, parseSubsystems,
} from '../../../types/teamModules';

async function patchTeam(teamId: number, body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/teams/${teamId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error || 'Could not save.';
  } catch {
    return 'Could not save.';
  }
}

export function ModulesGroup({ team, isAdmin, onTeamSaved }: { team: any; isAdmin?: boolean; onTeamSaved?: (t: any) => void }) {
  const [off, setOff] = useState<string[]>(() => parseDisabledModules(team.disabled_modules));
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { setOff(parseDisabledModules(team.disabled_modules)); }, [team.disabled_modules]);

  const toggle = async (id: string, on: boolean) => {
    const prev = off;
    const next = on ? off.filter((m) => m !== id) : [...off, id];
    setOff(next);
    setSaving(id);
    const err = await patchTeam(team.id, { disabled_modules: next });
    setSaving(null);
    if (err) { setOff(prev); notify(err, 'error'); return; }
    onTeamSaved?.({ id: team.id, disabled_modules: next.length ? JSON.stringify(next) : null });
  };

  return (
    <SettingsGroup
      title="Modules"
      description={`Turn off the parts your team doesn't use to keep the sidebar short. Nothing is deleted: switch a module back on and everything is where you left it.${isAdmin ? '' : ' Admins can change these.'}`}
    >
      {TEAM_MODULES.map((m) => (
        <SettingsRow key={m.id} label={m.label} description={m.description} htmlFor={`module-${m.id}`}>
          <Switch
            id={`module-${m.id}`}
            checked={!off.includes(m.id)}
            disabled={!isAdmin || saving !== null}
            onCheckedChange={(v: boolean) => void toggle(m.id, v)}
            aria-label={`${m.label} module`}
          />
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}

export function SubsystemsGroup({ team, isAdmin, onTeamSaved }: { team: any; isAdmin?: boolean; onTeamSaved?: (t: any) => void }) {
  const [list, setList] = useState<string[]>(() => parseSubsystems(team.subsystems));
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setList(parseSubsystems(team.subsystems)); }, [team.subsystems]);
  const isDefault = team.subsystems == null;

  const save = async (next: string[] | null) => {
    const prev = list;
    setList(next ?? [...DEFAULT_SUBSYSTEMS]);
    setSaving(true);
    const err = await patchTeam(team.id, { subsystems: next });
    setSaving(false);
    if (err) { setList(prev); notify(err, 'error'); return false; }
    onTeamSaved?.({ id: team.id, subsystems: next ? JSON.stringify(next) : null });
    return true;
  };

  const add = async () => {
    const next = cleanSubsystems([...list, draft]);
    if (next.length === list.length) { setDraft(''); return; }
    if (await save(next)) setDraft('');
  };

  return (
    <SettingsGroup
      title="Robot subsystems"
      description={`Tasks, notebook entries and stats are grouped by these.${isAdmin ? '' : ' Admins can change them.'}`}
    >
      <SettingsRow label="Subsystems" description={`Up to ${MAX_SUBSYSTEMS}.`} stack>
        <ul className="flex flex-wrap gap-2" aria-label="Robot subsystems">
          {list.map((name) => (
            <li key={name} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm">
              {name}
              {isAdmin && list.length > 1 && (
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label={`Remove ${name}`}
                  disabled={saving}
                  onClick={() => void save(list.filter((n) => n !== name))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <Input
                value={draft}
                onChange={(e: any) => setDraft(e.target.value)}
                maxLength={MAX_SUBSYSTEM_LENGTH}
                placeholder="Add a subsystem"
                aria-label="New subsystem name"
                className="w-48 max-sm:h-11"
                disabled={saving || list.length >= MAX_SUBSYSTEMS}
              />
              <Button type="submit" size="sm" variant="outline" disabled={saving || !draft.trim() || list.length >= MAX_SUBSYSTEMS}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </form>
            {!isDefault && (
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void save(null)}>
                <RotateCcw className="mr-1 h-4 w-4" /> Reset to defaults
              </Button>
            )}
          </div>
        )}
      </SettingsRow>
    </SettingsGroup>
  );
}
