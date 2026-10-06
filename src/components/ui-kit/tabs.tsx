// shadcn/ui Tabs on Radix, mapped to Control Point tokens. The active tab is
// filled with the team accent, matching the existing segmented controls.
import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '../cn';

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-4', className)} {...props} />;
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('inline-flex w-full sm:w-fit items-center gap-1 rounded-2xl border border-line bg-secondary p-1 overflow-x-auto custom-scrollbar', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 sm:px-4 py-2 text-sm font-bold',
        'text-text-muted transition-colors hover:text-text-base outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        'data-[state=active]:bg-accent data-[state=active]:text-accent-ink disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('outline-none min-w-0', className)} {...props} />;
}
