# Nesne Havuzları ve Sıfır-Ayırmalı Oyun Döngüsü

"Çöpü Değil, Bardağı Geri Ver: Canvas'ta Nesne Havuzları ve Sıfır-Ayırmalı Oyun
Döngüsü" makalesinin çalışan kodu. Her karede `push({...})` + `filter` ile çöp üreten
parçacık desenini bir `Pool<T>` ile sıfır-ayırmalı hâle getirir — ve havuzun ne zaman
gereksiz olduğunu benchmark'la gösterir.

Ek bağımlılık yoktur; sadece TypeScript + Vite + vitest toolchain'i.

## Dosya yapısı

```
src/
  particle.ts         # Particle interface + havuzsuz spawn/update (baseline churn deseni)
  pool.ts             # Pool<T> — acquire/release/reset, created (yüksek su seviyesi)
  particle-system.ts  # ParticleSystem — havuzlu burst, swap-remove update
  vec.ts              # Vec2 + in-place addInPlace/scaleInPlace/scaleAndAdd + reflect (scratch)
  rng.ts              # makeRng(seed) — deterministik mulberry32
  bench.ts            # benchBaseline / benchPooled + BenchResult
  bench-cli.ts        # iki senaryoyu koşup tabloları basar (npm run bench)
  main.ts             # Görsel demo: havuzlu/havuzsuz toggle, canlı ayırma sayacı + FPS
test/
  pool.test.ts            # 4 test: farklı acquire, LIFO geri dönüş, reset, yüksek su seviyesi
  particle-system.test.ts # ölen parçacık iade + yeniden kullanım (allocations sabit)
  vec.test.ts             # scaleAndAdd out referansı + değer
index.html            # Vite giriş noktası (canvas + toggle butonu)
```

## Kurulum

```bash
npm install
```

## Test

```bash
npm test
```

6 test geçer: havuzun asla aynı nesneyi iki kez dağıtmadığı, LIFO ile release edileni
geri verdiği, `reset`'in hayalet bırakmadığı, yüksek su seviyesinde `created`'ın donduğu;
parçacık sisteminin ölen parçacığı iade edip yeni ayırma yapmadan yeniden kullandığı; ve
`scaleAndAdd`'in yeni nesne üretmeden `out` tamponunu yerinde güncellediği.

## Benchmark

```bash
npm run bench
```

Havuzsuz (`push`+`filter`) ve havuzlu (`ParticleSystem`) sürümü aynı deterministik sahnede
(tohumlu `mulberry32`) koşar. İki tablo basar. Beklenen çıktı (bu makinede ölçülen; ayırma
ve dizi sütunları makineden bağımsız, süre oynar):

```
### Yoğun senaryo (frames=3600, burstEvery=6, burstCount=60, seed=42)
| Metrik                     | Havuzsuz | Havuzlu |
| Üretilen nesne             |   36,000 |      347 |
| Kare başına dizi ayırması  |    3,600 |        0 |
| Süre (ms, medyan/5 koşu)   |     ~8   |     ~5   |
| Hayatta kalan (survived)   |      279 |      279 |

### Hafif senaryo (frames=600, burstEvery=60, burstCount=8, seed=42)
| Metrik                     | Havuzsuz | Havuzlu |
| Üretilen nesne             |       80 |        8 |
| Kare başına dizi ayırması  |      600 |        0 |
| Süre (ms, medyan/5 koşu)   |    ~0.02 |    ~0.01 |
| Hayatta kalan (survived)   |        0 |        0 |
```

- **Üretilen nesne** deterministiktir: havuzsuz `frames/burstEvery × burstCount`
  (36.000 ve 80); havuzlu yalnızca yüksek su seviyesi kadar (347 ve 8), sonra sabit.
- **survived** iki sürümde birebir eşittir — aynı parçacıklar, adil karşılaştırma.
- **Süre** makineye göre oynar. Yoğun senaryoda havuzlu belirgin daha hızlı; hafif
  senaryoda fark ölçüm gürültüsünde kaybolur — orada havuz kazanç getirmez.

## Görsel demo

```bash
npm run dev
```

`http://localhost:5173/` → canvas'ta sürekli parçacık patlaması. Sağ üstteki düğmeyle
**Havuzlu / Havuzsuz** modu arasında geçiş yap, sol üstte canlı ayırma sayacını ve FPS'i
izle. Testere dişini (sawtooth) görmek için Chrome DevTools → Performance ile kayıt al:
havuzsuz modda JS Heap tırtıklanır, havuzlu modda düz çizgiye yakın kalır.

## Build

```bash
npm run build
```

`tsc` (tip kontrolü) + `vite build` → `dist/`.

## Lisans

MIT
