import { useState, memo } from 'react';
import { KeyRound, Copy, Check } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { confirmDialog } from '../dialog';
import { Card, Button } from '../ui';

interface AccessCodeCardProps {
  team: any;
  setLoading: (v: boolean) => void;
  onRefresh: () => void;
}

/**
 * The team's join code: one-tap copy, plus regenerate behind a confirm
 * (the old code stops working immediately).
 */
function AccessCodeCard({ team, setLoading, onRefresh }: AccessCodeCardProps) {
  const [copiedCode, setCopiedCode] = useState(false);

  const copyAccessCode = async () => {
    if (!team?.access_code) return;
    try {
      await navigator.clipboard.writeText(team.access_code);
    } catch {
      /* clipboard unavailable */
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const regenerateCode = async () => {
    if (
      !(await confirmDialog({
        title: 'Regenerate access code',
        message: 'Generate a new access code? The old code will stop working.',
        confirmLabel: 'Regenerate',
        danger: true,
      }))
    )
      return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/teams/regenerate-code', { method: 'POST' });
      if (res.ok) onRefresh();
    } finally {
      setLoading(false);
    }
  };

  if (!team) return null;

  return (
    <Card title="Team Access Code" subtitle="Students join with this code" icon={KeyRound} className="xl:col-span-5 p-5 gap-3">
      <div className="flex flex-col gap-3">
        <p className="text-2xl font-mono font-bold text-accent tracking-[0.12em] whitespace-nowrap">{team.access_code}</p>
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={copyAccessCode} className="text-sm flex-1 !py-2.5">
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={regenerateCode} className="text-sm !py-2.5">
            Regenerate
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default memo(AccessCodeCard);
