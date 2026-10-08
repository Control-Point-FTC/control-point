// Live checklist under a new-password field (src/utils/password.ts rules).
import { Check, Circle } from 'lucide-react';
import { cn } from '../../components/cn';
import { passwordRules } from '../../utils/password';

export function PasswordChecklist({ value, id }: { value: string; id?: string }) {
  return (
    <ul id={id} className="grid gap-1 text-xs" aria-label="Password requirements">
      {passwordRules(value).map((r) => (
        <li key={r.label} className={cn('flex items-center gap-1.5', r.ok ? 'text-success' : 'text-muted-foreground')}>
          {r.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
          <span>{r.label}<span className="sr-only">{r.ok ? ' (done)' : ' (needed)'}</span></span>
        </li>
      ))}
    </ul>
  );
}
