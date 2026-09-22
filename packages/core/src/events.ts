/**
 * Minimal typed pub/sub, generic over a domain's event map. Deliberately not
 * DOM-based: core has no DOM dependency so it runs in tests, workers and
 * non-browser runtimes. UI packages re-dispatch these as CustomEvents.
 */
export class EventEmitter<TMap> {
  private listeners = new Map<keyof TMap, Set<(detail: any) => void>>();

  on<K extends keyof TMap>(event: K, listener: (detail: TMap[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  emit<K extends keyof TMap>(event: K, detail: TMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) listener(detail);
  }
}
