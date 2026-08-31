export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

let particles: Particle[] = [];

export function spawn(x: number, y: number, count: number, rng: () => number) {
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const speed = 40 + rng() * 150;
    const life = 0.3 + rng() * 0.4;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life,
      max: life,
    }); // her çağrı: heap'te yeni bir nesne
  }
}

export function update(dt: number) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
  }
  particles = particles.filter((p) => p.life > 0); // her kare: yepyeni bir dizi
}
