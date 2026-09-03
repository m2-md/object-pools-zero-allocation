import { benchBaseline, benchPooled } from "./bench";

// Timing is noisy. We run each version a few times and take the median, so a
// one-off GC/JIT spike does not skew the table. The allocation count is
// deterministic, so a single run is enough for it.
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function timeMs(fn: () => { ms: number }, runs = 5): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) samples.push(fn().ms);
  return median(samples);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

interface Scenario {
  title: string;
  frames: number;
  burstEvery: number;
  burstCount: number;
  seed: number;
}

function runScenario(sc: Scenario) {
  const base = benchBaseline(sc.frames, sc.burstEvery, sc.burstCount, sc.seed);
  const pooled = benchPooled(sc.frames, sc.burstEvery, sc.burstCount, sc.seed);

  const baseMs = timeMs(() =>
    benchBaseline(sc.frames, sc.burstEvery, sc.burstCount, sc.seed),
  );
  const pooledMs = timeMs(() =>
    benchPooled(sc.frames, sc.burstEvery, sc.burstCount, sc.seed),
  );

  const arrayAllocsBaseline = sc.frames; // filter → one array per frame

  console.log(`\n### ${sc.title}`);
  console.log(
    `(frames=${sc.frames}, burstEvery=${sc.burstEvery}, ` +
      `burstCount=${sc.burstCount}, seed=${sc.seed})\n`,
  );
  console.log("| Metric                     | Unpooled |  Pooled |");
  console.log("|----------------------------|----------|---------|");
  console.log(
    `| Objects created            | ${pad(fmt(base.allocations))} | ${pad(
      fmt(pooled.allocations),
    )} |`,
  );
  console.log(
    `| Array allocs (per frame)   | ${pad(fmt(arrayAllocsBaseline))} | ${pad(
      "0",
    )} |`,
  );
  console.log(
    `| Time (ms, median/${5} runs)   | ${pad(baseMs.toFixed(2))} | ${pad(
      pooledMs.toFixed(2),
    )} |`,
  );
  console.log(
    `| Survived (final count)     | ${pad(fmt(base.survived))} | ${pad(
      fmt(pooled.survived),
    )} |`,
  );

  if (base.survived !== pooled.survived) {
    throw new Error(
      `survived mismatch: baseline=${base.survived} pooled=${pooled.survived}` +
        " — the comparison is not fair!",
    );
  }
}

function pad(s: string): string {
  return s.padStart(8);
}

console.log("=".repeat(56));
console.log("  Object Pool Benchmark — pooled vs unpooled particles");
console.log("=".repeat(56));

runScenario({
  title: "Heavy scenario",
  frames: 3600,
  burstEvery: 6,
  burstCount: 60,
  seed: 42,
});

runScenario({
  title: "Light scenario (pooling unnecessary)",
  frames: 600,
  burstEvery: 60,
  burstCount: 8,
  seed: 42,
});

console.log(
  "\nNote: 'Objects created' and 'array allocs' are deterministic (machine-independent).",
);
console.log(
  "      'Time' varies by machine; the direction holds: pooled ≤ unpooled.",
);
console.log(
  "      In the light scenario the gap vanishes into noise — pooling buys nothing there.\n",
);
