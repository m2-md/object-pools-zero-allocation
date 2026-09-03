export type Vec2 = { x: number; y: number };

export function addInPlace(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  return out;
}

export function scaleInPlace(out: Vec2, a: Vec2, s: number): Vec2 {
  out.x = a.x * s;
  out.y = a.y * s;
  return out;
}

// out = a + b * s  — exactly the integrator's shape, in a single call
export function scaleAndAdd(out: Vec2, a: Vec2, b: Vec2, s: number): Vec2 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  return out;
}

const scratch: Vec2 = { x: 0, y: 0 }; // allocated once, outside the loop

export function reflect(vel: Vec2, normal: Vec2): void {
  const d = 2 * (vel.x * normal.x + vel.y * normal.y);
  scaleInPlace(scratch, normal, d); // scratch = normal * d
  vel.x -= scratch.x;
  vel.y -= scratch.y;
}
