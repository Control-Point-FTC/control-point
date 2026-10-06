// shadcn/ui basics (Card, Input, Textarea, Label, Badge, Skeleton, Separator, Table),
// mapped to Control Point tokens. Surfaces: primary = page, secondary = raised,
// elevated = cards/popovers, line = hairline borders, accent = team colour.
import * as React from 'react';
import { Label as LabelPrimitive, Separator as SeparatorPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

// --- Card -------------------------------------------------------------------

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('card-surface flex flex-col gap-4 p-5 sm:p-6', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex items-start justify-between gap-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('font-display text-lg font-bold tracking-tight text-text-base', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-xs text-text-muted', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('min-w-0', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center gap-2', className)} {...props} />;
}

// --- Form fields ------------------------------------------------------------

const field =
  'w-full min-w-0 rounded-xl border border-line bg-elevated px-3.5 text-sm text-text-base placeholder:text-text-muted/60 ' +
  'transition-[border-color,box-shadow] outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-rose-500/60 aria-invalid:ring-rose-500/20';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(field, 'h-10 py-2', className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(field, 'min-h-20 py-2.5', className)} {...props} />;
}
export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn('text-[11px] font-bold uppercase tracking-widest text-text-muted select-none', className)}
      {...props}
    />
  );
}

// --- Badge ------------------------------------------------------------------

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider leading-none whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-accent-ink',
        soft: 'border-accent/30 bg-accent/15 text-accent',
        secondary: 'border-line bg-text-base/[0.06] text-text-muted',
        outline: 'border-text-base/20 text-text-muted',
        beta: 'border-sky-400/50 bg-sky-500/15 text-sky-500',
        new: 'border-transparent bg-red-500 text-white',
        destructive: 'border-rose-500/30 bg-rose-500/15 text-rose-500',
        success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-500',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// --- Skeleton / Separator ---------------------------------------------------

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-xl bg-text-base/[0.06]', className)} {...props} />;
}
export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn('shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px', className)}
      {...props}
    />
  );
}

// --- Table ------------------------------------------------------------------

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto custom-scrollbar">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b [&_tr]:border-line', className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('border-b border-line transition-colors hover:bg-text-base/[0.03] data-[state=selected]:bg-accent/[0.08]', className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th data-slot="table-head" className={cn('h-10 px-3 text-left align-middle text-[10px] font-bold uppercase tracking-wider text-text-muted whitespace-nowrap', className)} {...props} />;
}
export function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('px-3 py-2.5 align-middle text-text-base', className)} {...props} />;
}
