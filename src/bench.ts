import { makeRng } from "./rng";
import { ParticleSystem } from "./particle-system";
import type { Particle } from "./particle";

export interface BenchResult {
  allocations: number; // number of Particle objects created
  ms: number; // total time
  survived: number; // how many are still alive at the end
}

export function benchBaseline(
  frames: number,
  burstEvery: number,
  burstCount: number,
  seed: number,
): BenchResult {
  const rng = makeRng(seed);
  let particles: Particle[] = [];
  let allocations = 0;
  const dt = 1 / 60;
  const t0 = performance.now();

  for (let f = 0; f < frames; f++) {
    if (f % burstEvery === 0) {
      for (let i = 0; i < burstCount; i++) {
        const a = rng() * Math.PI * 2;
        const speed = 40 + rng() * 150;
        const life = 0.3 + rng() * 0.4;
        particles.push({
          x: 0,
          y: 0,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life,
          max: life,
        });
        allocations++;
      }
    }
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
    }
    particles = particles.filter((p) => p.life > 0); // + one array per frame
  }

  return {
    allocations,
    ms: performance.now() - t0,
    survived: particles.length,
  };
}

export function benchPooled(
  frames: number,
  burstEvery: number,
  burstCount: number,
  seed: number,
): BenchResult {
  const rng = makeRng(seed);
  const sys = new ParticleSystem(0);
  const dt = 1 / 60;
  const t0 = performance.now();

  for (let f = 0; f < frames; f++) {
    if (f % burstEvery === 0) sys.burst(0, 0, burstCount, rng);
    sys.update(dt);
  }

  return {
    allocations: sys.allocations,
    ms: performance.now() - t0,
    survived: sys.activeCount,
  };
}
