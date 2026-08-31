import { benchBaseline, benchPooled } from "./bench";

// Süre ölçümü gürültülüdür. Her sürümü birkaç kez koşup medyanı alırız;
// böylece tek seferlik GC/JIT sıçramaları tabloyu yanıltmaz. Ayırma sayısı
// deterministiktir, tek koşu yeter.
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

  const arrayAllocsBaseline = sc.frames; // filter → kare başına bir dizi

  console.log(`\n### ${sc.title}`);
  console.log(
    `(frames=${sc.frames}, burstEvery=${sc.burstEvery}, ` +
      `burstCount=${sc.burstCount}, seed=${sc.seed})\n`,
  );
  console.log("| Metrik                     | Havuzsuz | Havuzlu |");
  console.log("|----------------------------|----------|---------|");
  console.log(
    `| Üretilen nesne             | ${pad(fmt(base.allocations))} | ${pad(
      fmt(pooled.allocations),
    )} |`,
  );
  console.log(
    `| Kare başına dizi ayırması  | ${pad(fmt(arrayAllocsBaseline))} | ${pad(
      "0",
    )} |`,
  );
  console.log(
    `| Süre (ms, medyan/${5} koşu)   | ${pad(baseMs.toFixed(2))} | ${pad(
      pooledMs.toFixed(2),
    )} |`,
  );
  console.log(
    `| Hayatta kalan (survived)   | ${pad(fmt(base.survived))} | ${pad(
      fmt(pooled.survived),
    )} |`,
  );

  if (base.survived !== pooled.survived) {
    throw new Error(
      `survived uyuşmuyor: baseline=${base.survived} pooled=${pooled.survived}` +
        " — karşılaştırma adil değil!",
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
  title: "Yoğun senaryo",
  frames: 3600,
  burstEvery: 6,
  burstCount: 60,
  seed: 42,
});

runScenario({
  title: "Hafif senaryo (havuz gereksiz)",
  frames: 600,
  burstEvery: 60,
  burstCount: 8,
  seed: 42,
});

console.log(
  "\nNot: 'Üretilen nesne' ve 'dizi ayırması' deterministiktir (makineden bağımsız).",
);
console.log(
  "     'Süre' makineye göre oynar; yön korunur: havuzlu ≤ havuzsuz eğilimi.",
);
console.log(
  "     Hafif senaryoda fark gürültüde kaybolur — havuz orada kazanç getirmez.\n",
);
