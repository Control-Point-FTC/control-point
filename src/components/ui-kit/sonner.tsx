// shadcn/ui Sonner toaster, themed with our tokens and following the app theme.
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme === 'light' ? 'light' : 'dark'}
      position="bottom-right"
      // Top lane of the bottom-right corner: above the bug button and any
      // install banner / @mention card on screen (see index.css).
      offset={{ bottom: 'calc(var(--cp-above-fab, 0px) + var(--cp-slot-banner, 0px) + var(--cp-slot-mention, 0px))', right: 'calc(1.5rem + var(--cp-side-dock, 0px))' }}
      mobileOffset={{ bottom: 'calc(var(--cp-above-fab, 0px) + var(--cp-slot-banner, 0px) + var(--cp-slot-mention, 0px))' }}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'group !rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-xl',
          description: '!text-muted-foreground',
          actionButton: '!bg-accent !text-accent-ink',
          cancelButton: '!bg-muted !text-muted-foreground',
        },
      }}
      style={{ zIndex: 115 } as React.CSSProperties}
      {...props}
    />
  );
}
export { toast } from 'sonner';
