import { Pool } from "./pool";
import type { Particle } from "./particle";

export class ParticleSystem {
  private pool: Pool<Particle>;
  private active: Particle[] = []; // the live particles on screen

  constructor(initial = 256) {
    this.pool = new Pool<Particle>({
      initial,
      create: () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0 }),
      reset: (p) => {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        p.life = 0;
        p.max = 0;
      },
    });
  }

  burst(x: number, y: number, count: number, rng: () => number) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire(); // not new: taken off the shelf
      const a = rng() * Math.PI * 2;
      const speed = 40 + rng() * 150;
      const life = 0.3 + rng() * 0.4;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.life = life;
      p.max = life;
      this.active.push(p);
    }
  }

  update(dt: number) {
    // No filter. When one dies, return it to the pool and move the last one into its slot.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;

      if (p.life <= 0) {
        this.pool.release(p); // give the glass back
        this.active[i] = this.active[this.active.length - 1]; // swap-remove
        this.active.pop();
      }
    }
  }

  get activeCount(): number {
    return this.active.length;
  }

  // Walk the live particles for drawing — without a copy or a new array (zero allocation).
  get particles(): readonly Particle[] {
    return this.active;
  }

  get allocations(): number {
    return this.pool.created;
  }
}
