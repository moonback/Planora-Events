/** Historique d'annulation par instantanés immuables (partage structurel : coût mémoire faible). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 200;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: rest };
}
