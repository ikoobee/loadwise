import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ContainerType, LoadPlan } from '@loadwise/core';
import { cargoWorldCenter } from './world-mapping.js';

export type CameraView = 'iso' | 'door' | 'side' | 'top';

const SKU_SLOTS = ['series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'series-6', 'series-7', 'series-8'];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ThreeView {
  setPlan(plan: LoadPlan): void;
  setStep(n: number): void;
  setCamera(view: CameraView): void;
  dispose(): void;
}

/**
 * 3D viewport: container wireframe + translucent walls (door end open),
 * cargo boxes colored by SKU (categorical palette slots), step visibility.
 */
export function createThreeView(host: HTMLElement): ThreeView {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let containerSize = { L: 12.03, W: 2.35, H: 2.69 }; // meters
  let boxes: THREE.Mesh[] = [];

  function lights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(8, 14, 10);
    scene.add(dir);
  }

  function buildContainer(c: ContainerType) {
    containerSize = { L: c.innerDim.l / 100, W: c.innerDim.w / 100, H: c.innerDim.h / 100 };
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(containerSize.W, 0.04, containerSize.L),
      new THREE.MeshLambertMaterial({ color: cssVar('--baseline') })
    );
    floor.position.set(0, -0.02, 0);
    scene.add(floor);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(containerSize.W, containerSize.H, containerSize.L)),
      new THREE.LineBasicMaterial({ color: cssVar('--ink-muted') })
    );
    edges.position.set(0, containerSize.H / 2, 0);
    scene.add(edges);

    const wallMat = new THREE.MeshBasicMaterial({
      color: cssVar('--series-1'), transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mkWall = (w: number, h: number, px: number, py: number, pz: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(px, py, pz);
      m.rotation.y = ry;
      scene.add(m);
    };
    mkWall(containerSize.W, containerSize.H, 0, containerSize.H / 2, -containerSize.L / 2, 0);
    mkWall(containerSize.L, containerSize.H, -containerSize.W / 2, containerSize.H / 2, 0, Math.PI / 2);
    mkWall(containerSize.L, containerSize.H, containerSize.W / 2, containerSize.H / 2, 0, Math.PI / 2);
    mkWall(containerSize.W, containerSize.L, 0, containerSize.H, 0, Math.PI / 2);
  }

  function setCam(view: CameraView) {
    const { L, W, H } = containerSize;
    const d = Math.max(L, W) * 1.1 + 4;
    const pos: Record<CameraView, [number, number, number]> = {
      iso: [d * 0.7, H + d * 0.5, d * 0.9],
      door: [0, H / 2 + 0.5, L / 2 + d * 0.8],
      side: [W / 2 + d, H / 2 + 1, 0],
      top: [0.01, H + d, 0.01],
    };
    camera.position.set(...pos[view]);
    controls.target.set(0, H / 2, 0);
    controls.update();
  }

  function rebuild(plan: LoadPlan) {
    for (const obj of [...scene.children]) {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
      }
    }
    scene.background = new THREE.Color(cssVar('--page'));
    lights();
    buildContainer(plan.container);
    boxes = [];

    const colors = new Map<string, THREE.Color>();
    let next = 0;
    for (const p of plan.placements) {
      if (!colors.has(p.skuId)) {
        colors.set(p.skuId, new THREE.Color(cssVar(`--${SKU_SLOTS[next % 8]}`)));
        next++;
      }
    }
    for (const p of plan.placements) {
      // world: x = width (centered), y = height, z = depth (rear = −L/2, door = +L/2)
      const g = new THREE.BoxGeometry(p.dim.dx / 100, p.dim.dz / 100, p.dim.dy / 100);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: colors.get(p.skuId) }));
      const center = cargoWorldCenter(p, containerSize);
      mesh.position.set(center.x, center.y, center.z);
      mesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(g),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
      ));
      scene.add(mesh);
      boxes.push(mesh);
    }
    setCam('iso');
    applyStep();
  }

  function applyStep() {
    boxes.forEach((m, i) => { m.visible = i < curVisible; });
  }
  let curVisible = 0;

  function onResize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const ro = new ResizeObserver(onResize);
  ro.observe(host);
  onResize();

  let raf = 0;
  (function animate() {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();

  scene.background = new THREE.Color(cssVar('--page'));

  return {
    setPlan(plan) { curVisible = plan.placements.length; rebuild(plan); },
    setStep(n) { curVisible = n; applyStep(); },
    setCamera: setCam,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
