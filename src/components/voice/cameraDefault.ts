/** Camera default: 'ask' | 'on' | 'off'. Camera never turns on automatically —
 *  this controls whether joining asks, always enables, or stays off. */
export type CameraDefault = 'ask' | 'on' | 'off';

export function getCameraDefault(): CameraDefault {
  try {
    const v = localStorage.getItem('controlpoint-camera-default');
    if (v === 'on' || v === 'off' || v === 'ask') return v;
  } catch { /* storage unavailable */ }
  return 'ask';
}

export function setCameraDefault(v: CameraDefault) {
  try { localStorage.setItem('controlpoint-camera-default', v); } catch { /* storage unavailable */ }
}
