import { describe, it, expect } from "vitest";
import { Pool } from "../src/pool";

interface Box {
  value: number;
}

function makePool(initial = 0) {
  return new Pool<Box>({
    initial,
    create: () => ({ value: 0 }),
    reset: (b) => {
      b.value = 0;
    },
  });
}

describe("Pool", () => {
  it("hands out a different object on each consecutive acquire", () => {
    const pool = makePool();
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b); // never hand the same glass to two people
  });

  it("returns a released object on the next acquire", () => {
    const pool = makePool();
    const a = pool.acquire();
    pool.release(a);
    const b = pool.acquire();
    expect(b).toBe(a); // same object, back on the shelf and handed out again
  });

  it("resets an object on release (no leftover state)", () => {
    const pool = makePool();
    const a = pool.acquire();
    a.value = 42;
    pool.release(a);
    const b = pool.acquire();
    expect(b.value).toBe(0); // no old drink left at the bottom
  });

  it("grows up to the high-water mark, then stops creating", () => {
    const pool = makePool();
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(pool.created).toBe(3);

    pool.release(a);
    pool.release(b);
    pool.release(c);

    // take all three back: they must all come off the shelf, with no new creation
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(pool.created).toBe(3); // the water level stays put
  });
});
