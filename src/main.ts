// Visual demo: runs the same particle scene in two modes.
//   - "Pooled"   → ParticleSystem (acquire/release, zero allocation)
//   - "Unpooled" → the module-level spawn/update pattern from particle.ts (push + filter)
// Same visual output, different memory profile. Open DevTools → Performance and
// watch the JS Heap graph: a sawtooth in unpooled mode, a flat line in pooled mode.
import { ParticleSystem } from "./particle-system";
import { makeRng } from "./rng";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const hud = document.getElementById("hud") as HTMLDivElement;
const toggle = document.getElementById("toggle") as HTMLButtonElement;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

let pooled = true;
const rng = makeRng(1337);

// The pooled path: a single system, reused across frames.
const sys = new ParticleSystem(512);

// The unpooled path: push({...}) + filter every frame (the same pattern as
// particle.ts, kept local here so we can show a counter).
interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}
let loose: P[] = [];
let looseAllocations = 0;

function spawnLoose(x: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const speed = 40 + rng() * 150;
    const life = 0.3 + rng() * 0.4;
    loose.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life,
      max: life,
    });
    looseAllocations++;
  }
}

function updateLoose(dt: number) {
  for (const p of loose) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
  }
  loose = loose.filter((p) => p.life > 0);
}

function burst(x: number, y: number, count: number) {
  if (pooled) sys.burst(x, y, count, rng);
  else spawnLoose(x, y, count);
}

function emitAt(clientX: number, clientY: number) {
  burst(clientX, clientY, 60);
}
canvas.addEventListener("pointerdown", (e) => emitAt(e.clientX, e.clientY));

toggle.addEventListener("click", () => {
  pooled = !pooled;
  toggle.textContent = `Mode: ${pooled ? "Pooled" : "Unpooled"}`;
});

let last = performance.now();
let fps = 0;
let autoTimer = 0;

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = fps * 0.9 + (1 / (dt || 1e-3)) * 0.1;

  // Keep the garbage pressure constant: burst at screen center every ~0.1 s.
  autoTimer += dt;
  if (autoTimer > 0.1) {
    autoTimer = 0;
    burst(canvas.width / 2, canvas.height / 2, 40);
  }

  if (pooled) sys.update(dt);
  else updateLoose(dt);

  ctx.fillStyle = "#292524";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f472b6";

  let active: number;
  let allocations: number;
  if (pooled) {
    // Draw the pooled particles EXACTLY the way the unpooled path draws them.
    // Same visual output, different memory profile — that is the whole point of the demo.
    const ps = sys.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    active = sys.activeCount;
    allocations = sys.allocations;
  } else {
    for (const p of loose) {
      const alpha = Math.max(0, p.life / p.max);
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    active = loose.length;
    allocations = looseAllocations;
  }

  hud.innerHTML =
    `Mode: <b>${pooled ? "Pooled" : "Unpooled"}</b><br>` +
    `FPS: ${fps.toFixed(0)}<br>` +
    `Active particles: ${active}<br>` +
    `Total allocations: <b>${allocations.toLocaleString("en-US")}</b>`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
