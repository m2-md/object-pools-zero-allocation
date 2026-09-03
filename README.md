# Object Pools and a Zero-Allocation Game Loop

<!-- LINKS:BEGIN — üretildi: scripts/sync-repo-links.py · elle düzenleme -->
**▶ [Live demo](https://m2-md.github.io/object-pools-zero-allocation/)** · [Source](https://github.com/m2-md/object-pools-zero-allocation)
<!-- LINKS:END -->

> Eliminating garbage collection pauses in HTML5 Canvas games: generic Pool<T>, in-place vector arithmetic, preallocated particle arrays, and pooled vs unpooled benchmarks.

Working code for the article "Give Back the Glass, Not the Garbage: Object Pools and a
Zero-Allocation Game Loop in Canvas". It takes the particle pattern that produces garbage
every frame with `push({...})` + `filter` and makes it zero-allocation with a `Pool<T>` —
and uses a benchmark to show when the pool is unnecessary.

There are no extra dependencies; just the TypeScript + Vite + vitest toolchain.

## File layout

```
src/
  particle.ts         # Particle interface + unpooled spawn/update (the baseline churn pattern)
  pool.ts             # Pool<T> — acquire/release/reset, created (high-water mark)
  particle-system.ts  # ParticleSystem — pooled burst, swap-remove update
  vec.ts              # Vec2 + in-place addInPlace/scaleInPlace/scaleAndAdd + reflect (scratch)
  rng.ts              # makeRng(seed) — deterministic mulberry32
  bench.ts            # benchBaseline / benchPooled + BenchResult
  bench-cli.ts        # runs both scenarios and prints the tables (npm run bench)
  main.ts             # Visual demo: pooled/unpooled toggle, live allocation counter + FPS
test/
  pool.test.ts            # 4 tests: distinct acquire, LIFO return, reset, high-water mark
  particle-system.test.ts # dead particle returned + reused (allocations stay constant)
  vec.test.ts             # scaleAndAdd out reference + value
index.html            # Vite entry point (canvas + toggle button)
```

## Setup

```bash
npm install
```

## Test

```bash
npm test
```

6 tests pass: that the pool never hands out the same object twice, that it gives back what
was released in LIFO order, that `reset` leaves no leftover state, that `created` freezes at
the high-water mark; that the particle system returns a dead particle and reuses it without
a new allocation; and that `scaleAndAdd` updates the `out` buffer in place with no new object.

## Benchmark

```bash
npm run bench
```

It runs the unpooled (`push`+`filter`) and pooled (`ParticleSystem`) versions on the same
deterministic scene (seeded `mulberry32`). It prints two tables. Expected output (measured on
this machine; the allocation and array columns are machine-independent, the time varies):

```
### Heavy scenario (frames=3600, burstEvery=6, burstCount=60, seed=42)
| Metric                     | Unpooled |  Pooled |
| Objects created            |   36,000 |      347 |
| Array allocs (per frame)   |    3,600 |        0 |
| Time (ms, median/5 runs)   |     ~8   |     ~5   |
| Survived (final count)     |      279 |      279 |

### Light scenario (frames=600, burstEvery=60, burstCount=8, seed=42)
| Metric                     | Unpooled |  Pooled |
| Objects created            |       80 |        8 |
| Array allocs (per frame)   |      600 |        0 |
| Time (ms, median/5 runs)   |    ~0.02 |    ~0.01 |
| Survived (final count)     |        0 |        0 |
```

- **Objects created** is deterministic: unpooled it is `frames/burstEvery × burstCount`
  (36,000 and 80); pooled it is only the high-water mark (347 and 8), then constant.
- **survived** is identical in both versions — the same particles, a fair comparison.
- **Time** varies by machine. In the heavy scenario the pooled version is clearly faster; in
  the light scenario the difference disappears into measurement noise — the pool buys nothing there.

## Visual demo

```bash
npm run dev
```

`http://localhost:5173/` → a continuous particle burst on the canvas. Use the button in the
top right to switch between **Pooled / Unpooled** mode, and watch the live allocation counter
and the FPS in the top left. To see the sawtooth, record with Chrome DevTools → Performance:
in unpooled mode the JS Heap is jagged, in pooled mode it stays close to a flat line.

> Do not open `index.html` with `file://` — the ES modules will not resolve and you
> will get a blank screen. The Vite dev server is required.

## Build

```bash
npm run build
```

`tsc` (type check) + `vite build` → `dist/`.

## License

MIT
