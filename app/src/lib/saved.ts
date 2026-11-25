import { useSyncExternalStore } from "react";

// Tiny in-memory "saved items" store (resets when the app restarts; enough for the demo).
const saved = new Set<number>();
const listeners = new Set<() => void>();
let snapshot: number[] = [];

export function toggleSaved(id: number): boolean {
  if (saved.has(id)) saved.delete(id); else saved.add(id);
  snapshot = [...saved];
  listeners.forEach((l) => l());
  return saved.has(id);
}

export function useSaved(id: number): boolean {
  const ids = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => snapshot,
  );
  return ids.includes(id);
}
