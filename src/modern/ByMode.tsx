// Route-level switch between a Legacy page and its rebuilt Modern page.
// In Modern mode a screen without a rebuilt page yet renders its Legacy page
// inside `.m-legacy` (an interim frame; see modern.css). Legacy mode always
// renders the Legacy page, untouched.
import type { ReactNode } from 'react';
import { useInterfaceMode } from './interfaceMode';

export function ByMode({ legacy, modern }: { legacy: ReactNode; modern?: ReactNode }) {
  const { mode } = useInterfaceMode();
  if (mode !== 'modern') return <>{legacy}</>;
  if (modern) return <>{modern}</>;
  return <div className="m-legacy flex min-w-0 grow flex-col">{legacy}</div>;
}
