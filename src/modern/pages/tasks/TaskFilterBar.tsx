// The task board's Filters popover and Group by menu. Values live in the URL
// (see taskFilters.ts), so a filtered board can be bookmarked or shared.
import { ListFilter, X } from 'lucide-react';
import {
  Badge, Button, Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui-kit';
import { FTC_AWARDS } from '../../../types/taskTags';
import { ToggleChips } from './TaskTags';
import { activeFilterCount, NO_FILTERS, PRIORITY_ORDER, type DueFilter, type GroupBy, type TaskFilters } from './taskFilters';

const PRIORITY_OPTIONS = [...PRIORITY_ORDER.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })), { value: 'none', label: 'No priority' }];
const AWARD_OPTIONS = FTC_AWARDS.map((a) => ({ value: a.id, label: a.name, title: a.criteria }));

export function TaskFiltersButton({ filters, onChange, subsystems, labels }: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  subsystems: string[];
  labels: string[];
}) {
  const n = activeFilterCount(filters);
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-sm:h-11" aria-label={n ? `Filters, ${n} on` : 'Filters'}>
          <ListFilter /> Filters {n > 0 && <Badge variant="soft" className="ml-0.5 px-1.5">{n}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,26rem)] space-y-4">
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <ToggleChips label="Priority" options={PRIORITY_OPTIONS} selected={filters.priority} onChange={(v) => set({ priority: v })} />
        </div>
        {subsystems.length > 0 && (
          <div className="space-y-1.5">
            <Label>Subsystem</Label>
            <ToggleChips label="Subsystem" options={subsystems.map((s) => ({ value: s, label: s }))} selected={filters.subsystem} onChange={(v) => set({ subsystem: v })} />
          </div>
        )}
        {labels.length > 0 && (
          <div className="space-y-1.5">
            <Label>Label</Label>
            <ToggleChips label="Label" options={labels.map((s) => ({ value: s, label: s }))} selected={filters.label} onChange={(v) => set({ label: v })} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Award evidence</Label>
          <ToggleChips label="Award evidence" options={AWARD_OPTIONS} selected={filters.award} onChange={(v) => set({ award: v })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-due-filter">Due</Label>
          <Select value={filters.due || 'any'} onValueChange={(v) => set({ due: (v === 'any' ? '' : v) as DueFilter })}>
            <SelectTrigger id="task-due-filter" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="week">Due in the next 7 days</SelectItem>
              <SelectItem value="none">No due date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {n > 0 && <Button variant="ghost" size="sm" onClick={() => onChange(NO_FILTERS)}><X /> Clear filters</Button>}
      </PopoverContent>
    </Popover>
  );
}

export function GroupBySelect({ value, onChange }: { value: GroupBy; onChange: (g: GroupBy) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as GroupBy)}>
      <SelectTrigger className="w-44 max-sm:h-11" aria-label="Group board by"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="status">Columns: Status</SelectItem>
        <SelectItem value="priority">Columns: Priority</SelectItem>
        <SelectItem value="assignee">Columns: Assignee</SelectItem>
        <SelectItem value="subsystem">Columns: Subsystem</SelectItem>
      </SelectContent>
    </Select>
  );
}
