// CSS for a page's drawing-surface background (Draw → Format Background),
// shared by the live canvas and printouts so both look the same.
import type { CanvasBackground } from './canvasModel';

export function backgroundStyle(background: CanvasBackground | null | undefined, picture: string): Record<string, string> {
  if (!background) return {};
  const fit = background.image?.fit;
  return {
    ...(background.color ? { backgroundColor: background.color } : {}),
    ...(picture ? {
      backgroundImage: `url("${picture}")`,
      backgroundRepeat: fit === 'tile' ? 'repeat' : 'no-repeat',
      backgroundSize: fit === 'cover' ? 'cover' : 'auto',
      backgroundPosition: fit === 'tile' ? 'top left' : fit === 'center' ? 'center center' : 'center top',
    } : {}),
  };
}
