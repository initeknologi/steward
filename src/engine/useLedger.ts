import { useSyncExternalStore } from "react";
import { store } from "./store.ts";

export function useLedger() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
