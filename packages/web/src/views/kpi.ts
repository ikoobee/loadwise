import type { AppState, Store } from '../state.js';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** KPI tiles, weight meter, warnings — pure DOM updates from state. */
export function bindKpi(store: Store): void {
  store.subscribe((s) => render(s));
  function render(s: AppState) {
    const $ = (id: string) => document.getElementById(id)!;
    if (!s.plan) {
      for (const id of ['kpiUtil', 'kpiLoaded', 'kpiWeight', 'kpiCog']) $(id).textContent = '–';
      $('meterText').textContent = '–';
      $('meterFill').style.width = '0%';
      $('warnings').textContent = '';
      return;
    }
    const p = s.plan.stats;
    $('kpiUtil').textContent = (p.volumeUtil * 100).toFixed(1) + '%';
    $('kpiLoaded').textContent = String(p.loaded);
    $('kpiLoadedSub').textContent =
      `共 ${p.totalQty} 件` + (p.totalQty > p.loaded ? ` · ${p.totalQty - p.loaded} 件未装` : '');
    $('kpiWeight').textContent = `${Math.round(p.weight).toLocaleString()} kg`;
    $('kpiCog').textContent = `${p.cogY <= 0 ? '偏柜尾' : '偏柜门'} ${Math.abs(p.cogY).toFixed(1)}%`;
    $('kpiCogSub').textContent = `左右 ${p.cogX >= 0 ? '右' : '左'} ${Math.abs(p.cogX).toFixed(1)}%`;

    const wu = p.weightUtil;
    const fill = $('meterFill') as HTMLDivElement;
    fill.style.width = Math.min(wu * 100, 100) + '%';
    fill.style.background = wu > 0.95
      ? cssVar('--status-danger')
      : wu > 0.85 ? cssVar('--status-warning') : cssVar('--accent');
    $('meterText').textContent =
      `${Math.round(p.weight).toLocaleString()} / ${p.maxWeight.toLocaleString()} kg（${(wu * 100).toFixed(1)}%）`;

    $('warnings').innerHTML = s.plan.warnings
      .map((w) => `<span class="warn-line">⚠ ${w}</span>`).join('');

    const un = s.plan.unplaced.reduce((n, g) => n + g.qty, 0);
    $('unplacedInfo').textContent = un > 0
      ? `⚠ ${un} 件未装载：${s.plan.unplaced.map((g) => g.skuId).join('、')}（${s.plan.unplaced[0]?.reason === 'weight-limit' ? '超出载重限制' : '空间/堆叠约束'}）`
      : '';
  }
}
