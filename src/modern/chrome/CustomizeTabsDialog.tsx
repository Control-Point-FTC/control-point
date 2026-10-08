// Pick the three phone tabs (Bruno and More stay fixed).
import { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui-kit';
import { DEFAULT_MOBILE_TABS, MOBILE_TAB_CHOICES, MOBILE_TAB_SLOTS, type MobileTabChoice } from './mobileTabs';

/** Dispatch on window to open the dialog from anywhere (the shell listens; phones only). */
export const CUSTOMIZE_TABS_EVENT = 'cp:customize-tabs';

export function CustomizeTabsDialog({ open, onOpenChange, current, allowed, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: MobileTabChoice[];
  allowed: (id: string) => boolean;
  onSave: (ids: string[]) => void;
}) {
  const choices = MOBILE_TAB_CHOICES.filter((c) => allowed(c.id));
  const [slots, setSlots] = useState<string[]>(() => current.map((c) => c.id));
  // Reset the draft when the dialog opens or the saved picks really change —
  // not when the shell re-renders with an equal (new) array.
  const currentKey = current.map((c) => c.id).join(',');
  useEffect(() => { if (open) setSlots(currentKey ? currentKey.split(',') : []); }, [open, currentKey]);
  const duplicate = new Set(slots).size !== slots.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Customize tab bar</DialogTitle>
          <DialogDescription>Choose the first three tabs. Bruno and More always stay. Saved on this device.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {Array.from({ length: MOBILE_TAB_SLOTS }, (_, i) => (
            <div key={i} className="grid gap-1.5">
              <Label htmlFor={`mtab-slot-${i}`}>Tab {i + 1}</Label>
              <Select value={slots[i] ?? ''} onValueChange={(v) => setSlots((s) => s.map((x, j) => (j === i ? v : x)))}>
                <SelectTrigger id={`mtab-slot-${i}`} className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{choices.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
          {duplicate && <p role="alert" className="text-xs text-destructive">Pick a different page for each tab.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setSlots(DEFAULT_MOBILE_TABS.filter(allowed))}>Reset</Button>
          <Button disabled={duplicate} onClick={() => { onSave(slots); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
