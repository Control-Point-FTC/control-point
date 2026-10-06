// shadcn/ui Sonner toaster, themed with our tokens and following the app theme.
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme === 'light' ? 'light' : 'dark'}
      position="bottom-right"
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
