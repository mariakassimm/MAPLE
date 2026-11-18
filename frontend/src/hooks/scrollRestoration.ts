import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { readPosition, savePosition } from '@/lib/scrollPositions';

const GIVE_UP_MS = 4000;

// While a restore is running the page may be shorter than the saved position (list still arriving), so the browser
// clamps scrollY. Those clamped values must not overwrite the position we are trying to return to.
let restoring = false;
const INTERRUPTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/** Jumps to `y`, retrying while the page is still growing (images and lists arriving). Stops as soon as the shopper scrolls. */
function restoreTo(y: number): () => void {
  let raf = 0;
  let done = false;
  const started = performance.now();
  restoring = true;
  const finish = () => {
    done = true;
    restoring = false;
    cancelAnimationFrame(raf);
    for (const e of INTERRUPTS) window.removeEventListener(e, finish);
  };
  for (const e of INTERRUPTS) window.addEventListener(e, finish, { passive: true });
  const step = () => {
    if (done) return;
    window.scrollTo({ top: y, behavior: 'instant' }); // the site's smooth-scroll CSS must not animate a restore
    if (Math.abs(window.scrollY - y) < 2 || performance.now() - started > GIVE_UP_MS) return finish();
    raf = requestAnimationFrame(step);
  };
  step();
  return finish;
}

/**
 * Scroll behaviour for the whole storefront:
 *  - Back/Forward returns to where the shopper was on that page (the catalogue keeps its place).
 *  - Following a link to another page starts at the top.
 *  - Changing only the query string (filters, sorting, paging) leaves the scroll position alone.
 */
export function useScrollRestoration(): void {
  const { key, pathname } = useLocation();
  const type = useNavigationType();
  const current = useRef({ key, pathname });
  const lastPath = useRef<string | null>(null);
  // Updated during render, not in an effect: when the router swaps pages the browser clamps scrollY and fires a scroll event
  // before effects run, and that event must be filed under the NEW page, not overwrite the page we just left.
  current.current = { key, pathname };

  // We restore positions ourselves, so the browser must not also try (it does so before the page has its content).
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const save = () => {
      raf = 0;
      if (restoring) return;
      savePosition(sessionStorage, current.current.key, current.current.pathname, window.scrollY);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(save);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // A click that starts a navigation must record the exact position first: the throttled scroll save can lag a few
    // frames behind, and by the time it runs the router may already have moved on.
    const saveNow = () => {
      savePosition(sessionStorage, current.current.key, current.current.pathname, window.scrollY);
    };
    document.addEventListener('click', saveNow, true);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', saveNow, true);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    current.current = { key, pathname };
    const pathChanged = lastPath.current !== pathname;
    lastPath.current = pathname;
    if (type === 'POP') {
      const y = readPosition(sessionStorage, key, pathname);
      if (y !== null && y > 0) return restoreTo(y);
      if (pathChanged) window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    if (pathChanged) window.scrollTo({ top: 0 });
  }, [key, pathname, type]);
}
