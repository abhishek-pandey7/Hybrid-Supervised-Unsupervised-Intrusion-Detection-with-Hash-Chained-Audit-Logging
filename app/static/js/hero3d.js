// 3-D view of results/projection.json: 700 legitimate and 700 phishing test URLs in
// the importance-weighted lexical feature space. Phishing points can be morphed to
// their position after the benign-mimicry attack; points the baseline forest misses
// are drawn as rings.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PALETTE = {
  light: { legit: '#2c3a55', phish: '#f2600c', frame: '#6f3a14', halo: 0.3 },
  dark: { legit: '#efe4dc', phish: '#ff7a2e', frame: '#ffcfa8', halo: 0.55 },
};

const vertexShader = /* glsl */ `
  uniform float uMix;
  uniform float uSize;
  attribute vec3 aTarget;
  attribute float aMissA;
  attribute float aMissB;
  attribute float aSeed;
  varying float vRing;
  void main() {
    float t = clamp(uMix * 1.4 - aSeed * 0.4, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aTarget, t);
    vRing = mix(aMissA, aMissB, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (5.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vRing;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = 1.0 - smoothstep(0.40, 0.5, d);
    float hole = smoothstep(0.20, 0.28, d);
    float a = disc * mix(1.0, hole, vRing);
    if (a < 0.02) discard;
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

function cloud(positions, targets, missA, missB, color, size, opacity) {
  const n = positions.length;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
  geo.setAttribute('aTarget', new THREE.Float32BufferAttribute(targets.flat(), 3));
  geo.setAttribute('aMissA', new THREE.Float32BufferAttribute(missA ?? new Array(n).fill(0), 1));
  geo.setAttribute('aMissB', new THREE.Float32BufferAttribute(missB ?? new Array(n).fill(0), 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(Array.from({ length: n }, Math.random), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    uniforms: {
      uMix: { value: 0 }, uSize: { value: size }, uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
    },
  });
  return new THREE.Points(geo, mat);
}

// soft disc marking where the legitimate URLs sit; they are too tightly packed to read as a cloud
function halo(points, { legit: color, halo: opacity }, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), color, transparent: true, depthWrite: false, opacity,
  }));
  const mean = [0, 1, 2].map((k) => points.reduce((a, p) => a + p[k], 0) / points.length);
  sprite.position.set(...mean);
  sprite.scale.setScalar(size);
  sprite.renderOrder = -1;
  return sprite;
}

export function createFeatureSpace(container, projection, { theme }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(4.0, 2.3, 4.7);

  // centre on the median URL and fit the bulk of the data (not its outliers) to the frame
  const ph = projection.phishing;
  const all = [...projection.legit, ...ph.clean, ...ph.mimicry];
  const quantile = (values, q) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(q * (sorted.length - 1))];
  };
  const center = [0, 1, 2].map((k) => quantile(all.map((p) => p[k]), 0.5));
  const spread = quantile(all.flatMap((p) => p.map((v, k) => Math.abs(v - center[k]))), 0.96);
  const LIMIT = 1.55;
  const place = (pts) => pts.map((p) => p.map((v, k) => Math.max(-LIMIT, Math.min(LIMIT, ((v - center[k]) / spread) * 1.2))));

  const group = new THREE.Group();
  scene.add(group);

  const legitPts = place(projection.legit);
  const caught = ph.rf_caught;
  const miss = (arr) => arr && arr.map((c) => 1 - c);
  const dpr = renderer.getPixelRatio();
  const legit = cloud(legitPts, legitPts, null, null, PALETTE[theme].legit, 7 * dpr, 0.6);
  const phish = cloud(place(ph.clean), place(ph.mimicry), miss(caught?.clean), miss(caught?.mimicry), PALETTE[theme].phish, 9 * dpr, 0.9);
  const legitHalo = halo(legitPts, PALETTE[theme], 0.7);
  group.add(legitHalo, legit, phish);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(3.1, 3.1, 3.1)),
    new THREE.LineBasicMaterial({ color: PALETTE[theme].frame, transparent: true, opacity: 0.14 }));
  group.add(frame);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.6;
  // on touch screens the canvas must not swallow page scrolling
  if (window.matchMedia('(pointer: coarse)').matches) {
    controls.enabled = false;
    renderer.domElement.style.touchAction = 'pan-y';
  }
  let dragging = false;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; });

  let mix = 0;
  let tween = null;
  let active = true;
  let onScreen = true;
  let raf = 0;
  let last = performance.now();

  function resize() {
    const { clientWidth: w, clientHeight: hgt } = container;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    renderOnce();
  }
  new ResizeObserver(resize).observe(container);

  function renderOnce() {
    legit.material.uniforms.uMix.value = mix;
    phish.material.uniforms.uMix.value = mix;
    renderer.render(scene, camera);
  }

  function frameLoop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      mix = tween.from + (tween.to - tween.from) * e;
      if (t >= 1) tween = null;
    }
    if (!reduced && !dragging) group.rotation.y += dt * 0.12;
    controls.update();
    renderOnce();
    schedule();
  }

  function schedule() {
    if (!raf && active && onScreen && document.visibilityState === 'visible') {
      last = performance.now();
      raf = requestAnimationFrame(frameLoop);
    }
  }

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    schedule();
  }).observe(container);
  document.addEventListener('visibilitychange', schedule);

  resize();
  schedule();

  return {
    setMode(mode) {
      const to = mode === 'mimicry' ? 1 : 0;
      if (reduced) {
        mix = to;
        tween = null;
        renderOnce();
        return;
      }
      tween = { from: mix, to, start: performance.now(), duration: 1800 };
      schedule();
    },
    setTheme(next) {
      legitHalo.material.color.set(PALETTE[next].legit);
      legitHalo.material.opacity = PALETTE[next].halo;
      legit.material.uniforms.uColor.value.set(PALETTE[next].legit);
      phish.material.uniforms.uColor.value.set(PALETTE[next].phish);
      frame.material.color.set(PALETTE[next].frame);
      renderOnce();
    },
    setActive(on) {
      active = on;
      if (on) schedule();
    },
  };
}
