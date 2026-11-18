// Remembers where the shopper was on each history entry, so Back returns to the same spot in a long catalogue.
// Positions are stored with the path they belong to: a saved position is only used for the page it was saved on.
export const SCROLL_STORAGE_KEY = 'maple-scroll';
const MAX_ENTRIES = 60;

type Saved = Record<string, { path: string; y: number }>;

const read = (store: Pick<Storage, 'getItem'>): Saved => {
  try {
    const parsed: unknown = JSON.parse(store.getItem(SCROLL_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Saved) : {};
  } catch {
    return {};
  }
};

export function savePosition(store: Pick<Storage, 'getItem' | 'setItem'>, key: string, path: string, y: number): void {
  const all = read(store);
  delete all[key]; // re-insert so the newest entry is last
  all[key] = { path, y: Math.max(0, Math.round(y)) };
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[old];
  try {
    store.setItem(SCROLL_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* private mode or full storage: restoring is a nicety, never required */
  }
}

export function readPosition(store: Pick<Storage, 'getItem'>, key: string, path: string): number | null {
  const entry = read(store)[key];
  return entry && entry.path === path && Number.isFinite(entry.y) ? entry.y : null;
}
