// shadcn/ui controls on Radix: Avatar, Switch, Checkbox, RadioGroup, Select,
// Progress, ToggleGroup, ScrollArea, Accordion, Collapsible.
// shadcn "primary" maps to our accent (bg-accent / text-accent-ink).
import * as React from 'react';
import {
  Avatar as AvatarP, Switch as SwitchP, Checkbox as CheckboxP, RadioGroup as RadioP, Select as SelectP,
  Progress as ProgressP, ToggleGroup as ToggleGroupP, ScrollArea as ScrollAreaP, Accordion as AccordionP,
  Collapsible as CollapsibleP,
} from 'radix-ui';
import { Check, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

// --- Avatar -----------------------------------------------------------------
export function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarP.Root>) {
  return <AvatarP.Root data-slot="avatar" className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)} {...props} />;
}
export function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarP.Image>) {
  return <AvatarP.Image data-slot="avatar-image" className={cn('aspect-square size-full object-cover', className)} {...props} />;
}
export function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarP.Fallback>) {
  return <AvatarP.Fallback data-slot="avatar-fallback" className={cn('flex size-full items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground', className)} {...props} />;
}

// --- Switch -----------------------------------------------------------------
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchP.Root>) {
  return (
    <SwitchP.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-accent data-[state=unchecked]:bg-input',
        className,
      )}
      {...props}
    >
      <SwitchP.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </SwitchP.Root>
  );
}

// --- Checkbox ---------------------------------------------------------------
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxP.Root>) {
  return (
    <CheckboxP.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink',
        className,
      )}
      {...props}
    >
      <CheckboxP.Indicator className="flex items-center justify-center"><Check className="size-3.5" strokeWidth={3} /></CheckboxP.Indicator>
    </CheckboxP.Root>
  );
}

// --- RadioGroup -------------------------------------------------------------
export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioP.Root>) {
  return <RadioP.Root data-slot="radio-group" className={cn('grid gap-2', className)} {...props} />;
}
export function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioP.Item>) {
  return (
    <RadioP.Item
      data-slot="radio-group-item"
      className={cn('aspect-square size-4 shrink-0 rounded-full border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=checked]:border-accent disabled:opacity-50', className)}
      {...props}
    >
      <RadioP.Indicator className="flex items-center justify-center"><Circle className="size-2 fill-accent text-accent" /></RadioP.Indicator>
    </RadioP.Item>
  );
}

// --- Select (Radix) ------------------------------------------------------------
export const Select = SelectP.Root;
export const SelectGroup = SelectP.Group;
export const SelectValue = SelectP.Value;
export function SelectTrigger({ className, children, size = 'default', ...props }: React.ComponentProps<typeof SelectP.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <SelectP.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors',
        'data-[placeholder]:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
        size === 'sm' ? 'h-8' : 'h-9',
        className,
      )}
      {...props}
    >
      {children}
      <SelectP.Icon asChild><ChevronDown className="size-4 opacity-60" /></SelectP.Icon>
    </SelectP.Trigger>
  );
}
export function SelectContent({ className, children, position = 'popper', ...props }: React.ComponentProps<typeof SelectP.Content>) {
  return (
    <SelectP.Portal>
      <SelectP.Content
        data-slot="select-content"
        data-esc-owner=""
        position={position}
        className={cn(
          'relative z-[90] max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)] data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectP.ScrollUpButton className="flex items-center justify-center py-1"><ChevronUp className="size-4" /></SelectP.ScrollUpButton>
        <SelectP.Viewport className="p-1">{children}</SelectP.Viewport>
        <SelectP.ScrollDownButton className="flex items-center justify-center py-1"><ChevronDown className="size-4" /></SelectP.ScrollDownButton>
      </SelectP.Content>
    </SelectP.Portal>
  );
}
export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectP.Item>) {
  return (
    <SelectP.Item
      data-slot="select-item"
      className={cn('relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectP.ItemIndicator><Check className="size-4 text-accent" /></SelectP.ItemIndicator>
      </span>
      <SelectP.ItemText>{children}</SelectP.ItemText>
    </SelectP.Item>
  );
}
export function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectP.Label>) {
  return <SelectP.Label className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...props} />;
}
export function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectP.Separator>) {
  return <SelectP.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

// --- Progress ---------------------------------------------------------------
export function Progress({ className, value, indicatorClassName, ...props }: React.ComponentProps<typeof ProgressP.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressP.Root data-slot="progress" value={value} className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
      <ProgressP.Indicator
        className={cn('h-full w-full flex-1 rounded-full bg-accent transition-transform duration-500 ease-out', indicatorClassName)}
        style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value || 0))}%)` }}
      />
    </ProgressP.Root>
  );
}

// --- ToggleGroup (segmented control) ------------------------------------------
const toggleItem = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none ' +
    'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 ' +
    'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-4 [&_svg]:shrink-0',
  { variants: { size: { default: 'h-7', sm: 'h-6 px-2 text-xs', lg: 'h-9' } }, defaultVariants: { size: 'default' } },
);
export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupP.Root>) {
  return <ToggleGroupP.Root data-slot="toggle-group" className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5', className)} {...props} />;
}
export function ToggleGroupItem({ className, size, ...props }: React.ComponentProps<typeof ToggleGroupP.Item> & VariantProps<typeof toggleItem>) {
  return <ToggleGroupP.Item data-slot="toggle-group-item" className={cn(toggleItem({ size }), className)} {...props} />;
}

// --- ScrollArea ---------------------------------------------------------------
export function ScrollArea({ className, children, ...props }: React.ComponentProps<typeof ScrollAreaP.Root>) {
  return (
    <ScrollAreaP.Root data-slot="scroll-area" className={cn('relative overflow-hidden', className)} {...props}>
      <ScrollAreaP.Viewport className="size-full rounded-[inherit]">{children}</ScrollAreaP.Viewport>
      <ScrollAreaP.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none p-px">
        <ScrollAreaP.Thumb className="relative flex-1 rounded-full bg-border" />
      </ScrollAreaP.Scrollbar>
      <ScrollAreaP.Corner />
    </ScrollAreaP.Root>
  );
}

// --- Accordion / Collapsible --------------------------------------------------
export const Accordion = AccordionP.Root;
export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionP.Item>) {
  return <AccordionP.Item data-slot="accordion-item" className={cn('border-b border-border last:border-b-0', className)} {...props} />;
}
export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionP.Trigger>) {
  return (
    <AccordionP.Header className="flex">
      <AccordionP.Trigger
        data-slot="accordion-trigger"
        className={cn('flex flex-1 items-center justify-between gap-4 rounded-md py-3 text-left text-sm font-medium outline-none transition-all hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 [&[data-state=open]>svg]:rotate-180', className)}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
      </AccordionP.Trigger>
    </AccordionP.Header>
  );
}
export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionP.Content>) {
  return (
    <AccordionP.Content data-slot="accordion-content" className="overflow-hidden text-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" {...props}>
      <div className={cn('pb-3', className)}>{children}</div>
    </AccordionP.Content>
  );
}
export const Collapsible = CollapsibleP.Root;
export const CollapsibleTrigger = CollapsibleP.Trigger;
export const CollapsibleContent = CollapsibleP.Content;
