import type { CargoItem, ContainerType, LoadPlan } from '@loadwise/core';

/**
 * Single source of truth. Unidirectional flow:
 *   input views → set() → notify subscribers → render views.
 * Solving runs in a Web Worker; the plan lands here via set() like any edit.
 */
export interface AppState {
  items: CargoItem[];
  container: ContainerType;
  clearance: number;
  plan: LoadPlan | null;
  curStep: number;
  solving: boolean;
}

type Listener = (s: AppState) => void;

export function createStore(initial: AppState) {
  const listeners = new Set<Listener>();
  let state = initial;
  return {
    get: () => state,
    set(patch: Partial<AppState>) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn: Listener) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
