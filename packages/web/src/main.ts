import './style.css';
import { CONTAINERS, type CargoItem, type ContainerType, type LoadPlan, type RotationMode } from '@loadwise/core';
import { createStore, type AppState } from './state.js';
import type { SolveResponse } from './solver.worker.js';
import { createThreeView, type CameraView } from './views/three-view.js';
import { bindKpi } from './views/kpi.js';
import { bindSteps } from './views/steps.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const DEMO_ITEMS: CargoItem[] = [
  { id: 'chair', name: '沙滩椅箱', dim: { l: 80, w: 60, h: 45 }, weight: 12, qty: 60, maxStackOn: 5, rotation: 'any' },
  { id: 'appliance', name: '小家电箱', dim: { l: 55, w: 45, h: 40 }, weight: 9, qty: 80, maxStackOn: 6, rotation: 'upright' },
  { id: 'machine', name: '整机大件', dim: { l: 120, w: 100, h: 95 }, weight: 180, qty: 6, maxStackOn: 0, rotation: 'any' },
  { id: 'softbag', name: '服装软包', dim: { l: 100, w: 75, h: 90 }, weight: 25, qty: 20, maxStackOn: 2, rotation: 'upright' },
  { id: 'led', name: 'LED 灯具', dim: { l: 65, w: 40, h: 35 }, weight: 7, qty: 100, maxStackOn: 8, rotation: 'any' },
];

const store = createStore({
  items: structuredClone(DEMO_ITEMS),
  container: CONTAINERS['40HQ']!,
  clearance: 1,
  loadingOrder: 'row',
  plan: null,
  curStep: 0,
  solving: false,
});

/* ---- toast ---- */
let toastTimer: number | undefined;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- solver worker ---- */
const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
let workerBusy = false;
worker.addEventListener('message', (e: MessageEvent<SolveResponse>) => {
  workerBusy = false;
  const res = e.data;
  if (!res.ok) {
    store.set({ solving: false });
    toast(`求解失败：${res.error}`);
    return;
  }
  store.set({ plan: res.plan, curStep: res.plan.placements.length, solving: false });
  const s = res.plan.stats;
  toast(`装载完成：${s.loaded}/${s.totalQty} 件，利用率 ${(s.volumeUtil * 100).toFixed(1)}%`);
});

function requestSolve() {
  if (workerBusy) return;
  const items = store.get().items.filter((it) => it.qty > 0 && it.dim.l > 0 && it.dim.w > 0 && it.dim.h > 0);
  if (items.length === 0) { toast('请先添加有效货物'); return; }
  workerBusy = true;
  store.set({ solving: true });
  worker.postMessage({
    container: store.get().container,
    items,
    clearance: store.get().clearance,
    loadingOrder: store.get().loadingOrder,
  });
}

/* ---- 3D viewport ---- */
const threeView = createThreeView($('three'));

/* ---- steps + guide ---- */
const stepsView = bindSteps((n) => setStep(n));

function setStep(n: number) {
  const s = store.get();
  if (!s.plan) return;
  const curStep = Math.max(0, Math.min(n, s.plan.placements.length));
  store.set({ curStep });
}

/* ---- playback ---- */
let playing = false;
let playTimer: number | undefined;
function togglePlay() {
  playing = !playing;
  $('playBtn').textContent = playing ? '⏸ 暂停' : '▶ 播放';
  if (playing) {
    const s = store.get();
    if (s.plan && store.get().curStep >= s.plan.placements.length) store.set({ curStep: 0 });
    playTimer = window.setInterval(() => {
      const st = store.get();
      if (!st.plan || st.curStep >= st.plan.placements.length) { togglePlay(); return; }
      setStep(st.curStep + 1);
    }, 420);
  } else {
    clearInterval(playTimer);
  }
}

/* ---- render loop: single subscription fans out to every view ---- */
let lastRenderedPlan: LoadPlan | null = null;
let renderedItemsRef: CargoItem[] | null = null;
store.subscribe((s) => {
  const runBtn = $('runBtn') as HTMLButtonElement;
  runBtn.disabled = s.solving;
  runBtn.textContent = s.solving ? '计算中…' : '开始装载';
  if (s.items !== renderedItemsRef) {
    renderedItemsRef = s.items;
    renderItems();
    refreshLegend(s.items);
  }
  stepsView.update(s.plan, s.curStep);
  if (s.plan) {
    if (s.plan !== lastRenderedPlan) threeView.setPlan(s.plan);
    threeView.setStep(s.curStep);
  }
  lastRenderedPlan = s.plan;
});
bindKpi(store);

/* ---- container selection ---- */
function currentContainerFromUI(): ContainerType {
  const sel = $<HTMLSelectElement>('containerSel').value;
  if (sel === 'CUSTOM') {
    return {
      id: 'CUSTOM', name: '自定义柜型',
      innerDim: { l: +$<HTMLInputElement>('cL').value, w: +$<HTMLInputElement>('cW').value, h: +$<HTMLInputElement>('cH').value },
      maxWeight: +$<HTMLInputElement>('cM').value,
    };
  }
  return CONTAINERS[sel]!;
}

function refreshContainerInfo() {
  const c = currentContainerFromUI();
  $('customDims').style.display = ($('containerSel') as HTMLSelectElement).value === 'CUSTOM' ? 'flex' : 'none';
  $('containerInfo').textContent =
    `内尺寸 ${c.innerDim.l} × ${c.innerDim.w} × ${c.innerDim.h} cm · 内容积 ${(c.innerDim.l * c.innerDim.w * c.innerDim.h / 1e6).toFixed(1)} m³ · 限重 ${c.maxWeight.toLocaleString()} kg`;
}

/* ---- items table ---- */
function renderItems() {
  const items = store.get().items;
  $('itemsBody').innerHTML = items.map((it, i) => {
    const slot = `--series-${(i % 8) + 1}`;
    const color = getComputedStyle(document.documentElement).getPropertyValue(slot).trim();
    return `<tr>
      <td><span class="swatch" style="background:${color}"></span><input type="text" class="w" style="width:64px" data-i="${i}" data-k="name" value="${it.name}"></td>
      <td><input type="number" class="w" data-i="${i}" data-k="l" value="${it.dim.l}"></td>
      <td><input type="number" class="w" data-i="${i}" data-k="w" value="${it.dim.w}"></td>
      <td><input type="number" class="w" data-i="${i}" data-k="h" value="${it.dim.h}"></td>
      <td><input type="number" class="w" data-i="${i}" data-k="weight" value="${it.weight}"></td>
      <td><input type="number" class="w" data-i="${i}" data-k="qty" value="${it.qty}"></td>
      <td><input type="number" class="w" data-i="${i}" data-k="maxStackOn" value="${it.maxStackOn}"></td>
      <td><select data-i="${i}" data-k="rotation" style="width:58px">${(['any', 'upright', 'fixed'] as RotationMode[]).map((r) =>
        `<option value="${r}" ${it.rotation === r ? 'selected' : ''}>${{ any: '任意', upright: '立放', fixed: '固定' }[r]}</option>`).join('')}</select></td>
      <td><button class="del" data-del="${i}">×</button></td>
    </tr>`;
  }).join('');
  $('itemsBody').querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((el) => {
    el.addEventListener('change', () => {
      const items = structuredClone(store.get().items);
      const target = items[+el.dataset.i!]!;
      const k = el.dataset.k!;
      if (k === 'name') target.name = (el as HTMLInputElement).value;
      else if (k === 'rotation') target.rotation = (el as HTMLSelectElement).value as RotationMode;
      else if (k === 'l' || k === 'w' || k === 'h') target.dim[k] = +el.value || 0;
      else (target as unknown as Record<string, number>)[k] = +el.value || 0;
      store.set({ items });
    });
  });
  $('itemsBody').querySelectorAll<HTMLElement>('[data-del]').forEach((el) =>
    el.addEventListener('click', () => {
      const items = structuredClone(store.get().items);
      items.splice(+el.dataset.del!, 1);
      store.set({ items });
    })
  );
}

function refreshLegend(items: CargoItem[]) {
  $('legend').innerHTML = items.slice(0, 8).map((it, i) => {
    const color = getComputedStyle(document.documentElement).getPropertyValue(`--series-${(i % 8) + 1}`).trim();
    return `<div class="legend-row"><span class="swatch" style="background:${color}"></span>${it.name}</div>`;
  }).join('') + (items.length > 8 ? '<div class="legend-row">…</div>' : '');
}

/* ---- events ---- */
$('containerSel').innerHTML =
  [...Object.values(CONTAINERS), { id: 'CUSTOM', name: '自定义柜型' } as ContainerType]
    .map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
$<HTMLSelectElement>('containerSel').value = '40HQ';
$('containerSel').addEventListener('change', () => {
  store.set({ container: currentContainerFromUI() });
  refreshContainerInfo();
});
$('cL').addEventListener('change', () => { store.set({ container: currentContainerFromUI() }); refreshContainerInfo(); });
$('cW').addEventListener('change', () => { store.set({ container: currentContainerFromUI() }); refreshContainerInfo(); });
$('cH').addEventListener('change', () => { store.set({ container: currentContainerFromUI() }); refreshContainerInfo(); });
$('cM').addEventListener('change', () => { store.set({ container: currentContainerFromUI() }); refreshContainerInfo(); });
$('clearance').addEventListener('change', () => {
  store.set({ clearance: Math.max(0, +$<HTMLInputElement>('clearance').value || 0) });
});
$('loadingOrder').addEventListener('change', () => {
  const v = $<HTMLSelectElement>('loadingOrder').value;
  store.set({ loadingOrder: v === 'layer' ? 'layer' : 'row' });
});
$('loadDemo').addEventListener('click', () => {
  store.set({ items: structuredClone(DEMO_ITEMS) });
  toast('已载入跨境混装示例');
});
let skuCounter = 0;
$('addItem').addEventListener('click', () => {
  const items = structuredClone(store.get().items);
  items.push({ id: `sku-new-${++skuCounter}`, name: '新货物', dim: { l: 60, w: 40, h: 40 }, weight: 10, qty: 10, maxStackOn: 3, rotation: 'any' });
  store.set({ items });
});
$('runBtn').addEventListener('click', requestSolve);
$('playBtn').addEventListener('click', togglePlay);
$('themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  if (lastRenderedPlan) threeView.setPlan(lastRenderedPlan); // rebuild materials with new palette
  threeView.setStep(store.get().curStep);
});
document.querySelectorAll<HTMLElement>('[data-view]').forEach((el) =>
  el.addEventListener('click', () => threeView.setCamera(el.dataset.view as CameraView))
);

refreshContainerInfo();
