import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** GET hook with loading / error / reload. Pass path=null to skip. `loading` is derived (no setState in the effect body). */
export function useApi(path) {
  const [tick, setTick] = useState(0);
  const key = `${path}#${tick}`;
  const [res, setRes] = useState({ key: null, data: null, meta: null, error: null });
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return undefined;
    const ctrl = new AbortController();
    api(path, { signal: ctrl.signal })
      .then((r) => setRes({ key, data: r.data, meta: r.meta || null, error: null }))
      .catch((e) => { if (e.name !== 'AbortError') setRes({ key, data: null, meta: null, error: e }); });
    return () => ctrl.abort();
  }, [path, key]);

  const loading = !!path && res.key !== key;
  if (!path) return { data: null, meta: null, loading: false, error: null, reload };
  return { data: res.data, meta: res.meta, loading, error: loading ? null : res.error, reload }; // stale data stays visible while reloading
}
