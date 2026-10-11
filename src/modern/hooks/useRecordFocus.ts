// Opening one record from a link (?item=12, ?member=4, ?id=7): once the list
// has loaded, scroll its row into view, highlight it briefly and drop the
// parameter. If the row isn't shown (filtered out, or removed meanwhile) say
// so instead of silently showing the list.
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '../../components/ui-kit';

export const RECORD_FOCUS_CLASS = 'cp-record-focus';

export function useRecordFocus(param: string, ready: boolean, what = 'That item') {
  const [params, setParams] = useSearchParams();
  const id = params.get(param);
  useEffect(() => {
    if (!id || !ready || !/^\d{1,12}$/.test(id)) return;
    let tries = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => setParams(p => { const n = new URLSearchParams(p); n.delete(param); return n; }, { replace: true });
    const find = () => {
      const row = document.querySelector<HTMLElement>(`[data-record-id="${id}"]`);
      if (!row) {
        if (++tries < 10) { timer = setTimeout(find, 150); return; }
        toast(`${what} isn’t in this list right now. Clear any search or filter, or it may have been removed.`);
        done(); return;
      }
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add(RECORD_FOCUS_CLASS);
      if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1');
      row.focus({ preventScroll: true });
      setTimeout(() => row.classList.remove(RECORD_FOCUS_CLASS), 2500);
      done();
    };
    find();
    return () => clearTimeout(timer);
  }, [id, ready, param, what, setParams]);
}
