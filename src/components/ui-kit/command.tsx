// shadcn/ui Command (cmdk) + CommandDialog.
import * as React from 'react';
import { Command as CommandP } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '../cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './overlay';

export function Command({ className, ...props }: React.ComponentProps<typeof CommandP>) {
  return <CommandP data-slot="command" className={cn('flex size-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground', className)} {...props} />;
}

export function CommandDialog({ title = 'Command menu', description = 'Search for a page or action', children, className, ...props }: React.ComponentProps<typeof Dialog> & {
  title?: string; description?: string; className?: string;
}) {
  return (
    <Dialog {...props}>
      <DialogContent showClose={false} className={cn('top-[12vh] translate-y-0 max-w-xl gap-0 overflow-hidden p-0', className)}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command loop className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandP.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex items-center gap-2 border-b border-border px-4">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <CommandP.Input
        data-slot="command-input"
        className={cn('flex h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50', className)}
        {...props}
      />
    </div>
  );
}
export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandP.List>) {
  return <CommandP.List data-slot="command-list" className={cn('max-h-[min(60vh,420px)] overflow-y-auto overflow-x-hidden p-2', className)} {...props} />;
}
export function CommandEmpty(props: React.ComponentProps<typeof CommandP.Empty>) {
  return <CommandP.Empty data-slot="command-empty" className="py-10 text-center text-sm text-muted-foreground" {...props} />;
}
export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandP.Group>) {
  return <CommandP.Group data-slot="command-group" className={cn('overflow-hidden text-foreground', className)} {...props} />;
}
export function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandP.Separator>) {
  return <CommandP.Separator data-slot="command-separator" className={cn('-mx-2 my-1 h-px bg-border', className)} {...props} />;
}
export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandP.Item>) {
  return (
    <CommandP.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none',
        'data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
export function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="command-shortcut" className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />;
}
