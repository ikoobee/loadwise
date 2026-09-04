import type { LoadPlan } from '@loadwise/core';
import { drawGuide, drawTopGuide, skuColorMap } from './guide.js';

const SKU_SLOTS = ['series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'series-6', 'series-7', 'series-8'];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Loading-sequence list + step label/slider sync + guide canvas. */
export function bindSteps(
  onStepClick: (n: number) => void
): { update: (plan: LoadPlan | null, curStep: number) => void } {
  const list = document.getElementById('stepsList')!;
  const label = document.getElementById('stepLabel')!;
  const slider = document.getElementById('stepSlider') as HTMLInputElement;
  const canvas = document.getElementById('guideCanvas') as HTMLCanvasElement;
  const topCanvas = document.getElementById('guideTopCanvas') as HTMLCanvasElement | null;
  let colors = new Map<string, string>();
  let lastPlan: LoadPlan | null = null;

  slider.addEventListener('input', () => onStepClick(+slider.value));

  function update(plan: LoadPlan | null, curStep: number) {
    label.textContent = `步骤 ${curStep} / ${plan ? plan.placements.length : 0}`;
    slider.max = String(plan ? plan.placements.length : 0);
    slider.value = String(curStep);

    if (!plan) {
      list.innerHTML = '';
      lastPlan = null;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      topCanvas?.getContext('2d')?.clearRect(0, 0, topCanvas.width, topCanvas.height);
      return;
    }
    if (plan !== lastPlan) {
      colors = skuColorMap(plan);
      list.innerHTML = plan.placements.map((p) => `
        <div class="step-item" data-step="${p.step}">
          <span class="step-no">#${p.step}</span>
          <span class="swatch" style="background:${colors.get(p.skuId) ?? cssVar('--ink-muted')}"></span>${p.skuId}
          <span class="step-pos">(${Math.round(p.pos.x)}, ${Math.round(p.pos.y)}, ${Math.round(p.pos.z)}) · ${p.dim.dx}×${p.dim.dy}×${p.dim.dz}</span>
        </div>`).join('');
      list.querySelectorAll<HTMLElement>('.step-item').forEach((el) =>
        el.addEventListener('click', () => onStepClick(+el.dataset.step!))
      );
      lastPlan = plan;
    }
    markCurrent(curStep);
    drawGuide(canvas, plan, curStep, colors);
    if (topCanvas) drawTopGuide(topCanvas, plan, curStep, colors);
  }

  function markCurrent(curStep: number) {
    list.querySelectorAll<HTMLElement>('.step-item').forEach((el) =>
      el.classList.toggle('current', +el.dataset.step! === curStep)
    );
    list.querySelector<HTMLElement>('.step-item.current')?.scrollIntoView({ block: 'nearest' });
  }

  return {
    update,
  };
}
