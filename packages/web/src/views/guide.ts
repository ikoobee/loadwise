import type { ContainerType, LoadPlan, Placement } from '@loadwise/core';

/** Canvas-space rectangle in CSS pixels. */
export interface PlaneRect { x: number; y: number; w: number; h: number }

/**
 * Transform from container cm-space to canvas px-space on the door-view plane
 * (width × height). `oy` is the canvas y of the z = 0 line (frame bottom edge);
 * canvas y grows downward, so higher cargo maps to smaller y.
 */
export interface DoorViewTransform { s: number; ox: number; oy: number }

export const GUIDE_PAD = { l: 46, r: 16, t: 26, b: 34 };

/** Fit the container's width×height face into the canvas with padding. */
export function doorViewTransform(
  container: ContainerType,
  canvasW: number,
  canvasH: number,
  pad = GUIDE_PAD
): DoorViewTransform {
  const W = container.innerDim.w;
  const H = container.innerDim.h;
  const s = Math.min((canvasW - pad.l - pad.r) / W, (canvasH - pad.t - pad.b) / H);
  const ox = pad.l + (canvasW - pad.l - pad.r - W * s) / 2;
  const oy = canvasH - pad.b - (canvasH - pad.t - pad.b - H * s) / 2;
  return { s, ox, oy };
}

/** Project one placement onto the door-view plane (its width×height footprint). */
export function projectDoorView(p: Placement, t: DoorViewTransform): PlaneRect {
  return {
    x: t.ox + p.pos.x * t.s,
    y: t.oy - (p.pos.z + p.dim.dz) * t.s,
    w: p.dim.dx * t.s,
    h: p.dim.dz * t.s,
  };
}

/** Transform for the top-view plane (width × depth). `oy` is the y = 0 line (rear edge); canvas y grows toward the door. */
export interface TopViewTransform { s: number; ox: number; oy: number; L: number }

export function topViewTransform(
  container: ContainerType,
  canvasW: number,
  canvasH: number,
  pad = GUIDE_PAD
): TopViewTransform {
  const W = container.innerDim.w;
  const L = container.innerDim.l;
  const s = Math.min((canvasW - pad.l - pad.r) / W, (canvasH - pad.t - pad.b) / L);
  const ox = pad.l + (canvasW - pad.l - pad.r - W * s) / 2;
  const oy = pad.t + (canvasH - pad.t - pad.b - L * s) / 2;
  return { s, ox, oy, L };
}

/** Project one placement onto the top-view plane (its width×depth footprint). */
export function projectTopView(p: Placement, t: TopViewTransform): PlaneRect {
  return {
    x: t.ox + p.pos.x * t.s,
    y: t.oy + p.pos.y * t.s,
    w: p.dim.dx * t.s,
    h: p.dim.dy * t.s,
  };
}

const SKU_SLOTS = ['series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'series-6', 'series-7', 'series-8'];

/** Stable skuId → palette slot assignment (first-appearance order in the plan). */
export function skuColorMap(plan: LoadPlan): Map<string, string> {
  const css = getComputedStyle(document.documentElement);
  const map = new Map<string, string>();
  let next = 0;
  for (const p of plan.placements) {
    if (!map.has(p.skuId)) {
      map.set(p.skuId, css.getPropertyValue(`--${SKU_SLOTS[next % 8]}`).trim());
      next++;
    }
  }
  return map;
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Render the loading guide (door-view projection) up to `curStep`.
 * Cargo farther from the door is drawn more transparent; the current step is outlined.
 */
export function drawGuide(
  canvas: HTMLCanvasElement,
  plan: LoadPlan,
  curStep: number,
  colorMap: Map<string, string>
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const c = plan.container;
  const t = doorViewTransform(c, cssW, cssH);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink-muted').trim();
  const baseline = css.getPropertyValue('--baseline').trim();
  const ink1 = css.getPropertyValue('--ink-1').trim();

  // Frame (oy is the z=0 line, so the frame top sits at oy − H·s)
  ctx.strokeStyle = baseline;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(t.ox, t.oy - c.innerDim.h * t.s, c.innerDim.w * t.s, c.innerDim.h * t.s);
  ctx.fillStyle = ink;
  ctx.font = '10px system-ui';
  ctx.fillText(`${c.name} · 宽 ${c.innerDim.w} × 高 ${c.innerDim.h} cm`, t.ox, t.oy - c.innerDim.h * t.s - 8);
  ctx.fillText('← 柜门侧', t.ox + c.innerDim.w * t.s - 60, t.oy + 16);

  // Cargo projection (deeper = more transparent; current step outlined)
  for (const p of plan.placements) {
    if (p.step > curStep) continue;
    const depth = (p.pos.y + p.dim.dy / 2) / c.innerDim.l; // 0 = rear, 1 = door
    const alpha = 0.35 + 0.65 * (1 - depth);
    const r = projectDoorView(p, t);
    ctx.fillStyle = withAlpha(colorMap.get(p.skuId) ?? '#888888', alpha);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (p.step === curStep) {
      ctx.strokeStyle = ink1;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = ink1;
      ctx.font = 'bold 10px system-ui';
      ctx.fillText(`#${p.step}`, r.x + 3, r.y + 11);
    }
  }
}

/**
 * Top view (width × depth) — shows the row structure of the loading order.
 * Rear edge at the top, door at the bottom; higher stacks fade so rear/low
 * cargo reads solid. Current step is outlined.
 */
export function drawTopGuide(
  canvas: HTMLCanvasElement,
  plan: LoadPlan,
  curStep: number,
  colorMap: Map<string, string>
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const c = plan.container;
  const t = topViewTransform(c, cssW, cssH);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink-muted').trim();
  const baseline = css.getPropertyValue('--baseline').trim();
  const ink1 = css.getPropertyValue('--ink-1').trim();

  ctx.strokeStyle = baseline;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(t.ox, t.oy, c.innerDim.w * t.s, t.L * t.s);
  ctx.fillStyle = ink;
  ctx.font = '10px system-ui';
  ctx.fillText(`俯视 · 宽 ${c.innerDim.w} × 深 ${c.innerDim.l} cm`, t.ox, t.oy - 8);
  ctx.fillText('柜尾', t.ox - 30, t.oy + 8);
  ctx.fillText('柜门 ↓', t.ox + c.innerDim.w * t.s - 40, t.oy + t.L * t.s + 14);

  for (const p of plan.placements) {
    if (p.step > curStep) continue;
    const height = (p.pos.z + p.dim.dz / 2) / c.innerDim.h; // 0 = floor, 1 = top
    const alpha = 0.85 - 0.5 * height;
    const r = projectTopView(p, t);
    ctx.fillStyle = withAlpha(colorMap.get(p.skuId) ?? '#888888', alpha);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (p.step === curStep) {
      ctx.strokeStyle = ink1;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = ink1;
      ctx.font = 'bold 10px system-ui';
      ctx.fillText(`#${p.step}`, r.x + 3, r.y + 11);
    }
  }
}
