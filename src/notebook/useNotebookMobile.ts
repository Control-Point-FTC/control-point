import { useEffect, useState } from 'react';
export function useNotebookMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(max-width: 767px)').matches ?? window.innerWidth < 768));
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 767px)'); if (!media) return;
    const update = () => setMobile(media.matches); media.addEventListener('change', update); update();
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}
