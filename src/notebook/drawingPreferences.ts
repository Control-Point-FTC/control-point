export type DrawingTool = 'type' | 'select' | 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'shape' | 'ruler';
export type DrawingPreferences = { tool: DrawingTool; color: string; size: number };
const tools: DrawingTool[] = ['type','select','pen','highlighter','eraser','lasso','shape','ruler'];
export function readDrawingPreferences(key?: string): DrawingPreferences {
  const defaults: DrawingPreferences = { tool: 'type', color: '#111111', size: 3 };
  if (!key) return defaults;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { tool: tools.includes(value.tool) ? value.tool : defaults.tool, color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : defaults.color, size: [2,3,6,12].includes(value.size) ? value.size : defaults.size };
  } catch { return defaults; }
}
