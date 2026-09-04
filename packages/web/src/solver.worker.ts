import { solveL1, type CargoItem, type ContainerType, type LoadPlan, type LoadingOrder } from '@loadwise/core';

export interface SolveRequest {
  container: ContainerType;
  items: CargoItem[];
  clearance: number;
  loadingOrder: LoadingOrder;
}

export type SolveResponse =
  | { ok: true; plan: LoadPlan }
  | { ok: false; error: string };

self.addEventListener('message', (e: MessageEvent<SolveRequest>) => {
  const { container, items, clearance, loadingOrder } = e.data;
  try {
    const plan = solveL1(container, items, { clearance, loadingOrder });
    const res: SolveResponse = { ok: true, plan };
    self.postMessage(res);
  } catch (err) {
    const res: SolveResponse = { ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(res);
  }
});
