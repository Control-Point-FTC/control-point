// shadcn/ui Button, mapped to Control Point tokens:
//   shadcn primary  -> our accent (per-team colour) with accent-ink text
//   shadcn accent   -> a neutral text-base tint (hover fills)
import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all ' +
    'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 ' +
    "[&_svg:not([class*='size-']):not([class*='w-']):not([class*='h-'])]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-primary',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-ink font-bold shadow-[0_4px_16px_color-mix(in_srgb,var(--color-accent)_25%,transparent)] hover:brightness-105',
        secondary: 'bg-elevated text-text-base border border-line hover:bg-text-base/[0.08]',
        outline: 'border border-line bg-transparent text-text-base hover:bg-text-base/[0.06] hover:border-text-base/20',
        ghost: 'text-text-muted hover:text-text-base hover:bg-text-base/[0.06]',
        destructive: 'bg-rose-500/15 text-rose-500 border border-rose-500/30 hover:bg-rose-500/25',
        link: 'text-accent underline-offset-4 hover:underline px-0 active:scale-100',
      },
      // default and icon grow to 44px on phones (touch targets), so call
      // sites don't each add max-sm:h-11 / max-sm:size-11.
      size: {
        default: 'h-10 px-4 max-sm:h-11',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'size-10 max-sm:size-11',
        'icon-sm': 'size-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a link) with button styles. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
