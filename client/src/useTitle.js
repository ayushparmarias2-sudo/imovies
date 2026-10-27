import { useEffect } from 'react';

/** WCAG 2.4.2: every view gets its own document title. */
export function useTitle(title) {
  useEffect(() => { if (title) document.title = `${title} — iMovies`; }, [title]);
}
