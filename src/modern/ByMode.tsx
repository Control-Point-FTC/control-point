// Route-level switch between a Classic (legacy) page and its rebuilt Modern
// page. Since phase 9e every screen has a Modern page, so `modern` is
// required; Classic mode always renders the Classic page, untouched.
import type { ReactNode } from 'react';
import { useInterfaceMode } from './interfaceMode';

export function ByMode({ legacy, modern }: { legacy: ReactNode; modern: ReactNode }) {
  const { mode } = useInterfaceMode();
  return <>{mode === 'modern' ? modern : legacy}</>;
}
