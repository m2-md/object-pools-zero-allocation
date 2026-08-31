
# Çöpü Değil, Bardağı Geri Ver: Canvas'ta Nesne Havuzları ve Sıfır-Ayırmalı Oyun Döngüsü

*Her karede parçacık üretip çöpe atan desenimizin GC duraklamalarını önce ölçüyoruz, sonra bir object pool ile yok ediyoruz — ve "ne zaman gereksiz" olduğunu da benchmark'la gösteriyoruz.*

*Tahmini okuma süresi: 14 dakika*

---

Bir yaz festivalinde içecek aldığınızı düşünün. İçtiğiniz her bardağı yere atsanız ne olur? Kısa sürede ortalık bardak dağı olur. Derken temizlik ekibi gelir, müziği kısarlar, herkes durur, ekip her yeri süpürür, sonra festival kaldığı yerden devam eder. Kısa ama can sıkıcı bir donma.

Tarayıcıdaki oyunumuzun parçacık sistemi tam olarak böyle çalışıyor.

Fizik motorunu yazdığımız yazıda taşları kırınca kıvılcımlar saçılıyordu; falling-game'de ise her yakalayışta bir patlama vardı. İkisinde de aynı deseni kullanmıştık: her karede `particles.push({...})` ile yeni parçacıklar ekle, ölenleri `particles = particles.filter(p => p.life > 0)` ile at. On dört kıvılcımlık minik bir patlamada bu kimseyi rahatsız etmez. Ama patlama büyüyünce, saniyede yüzlerce parçacık doğup ölünce, o attığımız bardaklar birikmeye başlar. Ve er ya da geç temizlik ekibi gelir: **garbage collector** (çöp toplayıcı).

Bu yazıda o temizlik molasını kaldırıyoruz. Bardağı yere atmak yerine iade edeceğiz. Sırayla: önce derdi DevTools'ta testere dişi grafiğiyle teşhis edeceğiz, sonra genel bir `Pool<T>` (nesne havuzu) yazacağız, parçacık sistemini ona bağlayacağız, sıcak döngüdeki geçici vektör ayırmalarını sıfıra indireceğiz, kazancı ölçeceğiz — ve dürüst bölümde havuzun aslında hiç işe yaramadığı anı da benchmark'la göstereceğiz.

Broad-phase yazısında nesne *sayısını* ölçeklemiştik: 200'den 20.000'e. Bu yazı sayının değil, *çöpün* peşinde. İkisi birlikte "birkaç nesneden binlerce nesneye" hikâyesinin diğer yarısını tamamlıyor.

### Testere Dişi

Önce bir konuda net olalım: JavaScript'te bellek yönetimi otomatiktir. `{ x: 0, y: 0 }` yazdığınızda motor sizin için heap'te (öbek) yer ayırır, siz o nesneyle işiniz bitince de — referansını bırakınca — garbage collector onu toplar. Hiçbir şeyi elle serbest bırakmazsınız. Çoğu zaman bu bir nimettir.

Oyun döngüsünün sıcak yolunda ise bir tuzağa döner.

Sorunun kaynağı şu masum görünen emitter. Falling-game'deki `burst` ile fizik yazısındaki `spawnParticles`'ın ortak iskeleti:

```ts
// src/particle.ts — düzeltmeden ÖNCEKİ desen (baseline churn)
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
```

Bu kodda iki ayrı çöp kaynağı var. Birincisi bariz: her `push({...})` bir bardak dağıtır — heap'te yeni bir `Particle` nesnesi. İkincisi daha sinsi: her karedeki `filter`, ölüleri ayıklamak için **baştan yeni bir dizi** oluşturur. Sahnede 500 parçacık varsa, ölen bir tanesini atmak için 499 hayatta olanı yeni bir diziye kopyalarsınız. Saniyede 60 kez.

Peki bu neden bir soruna dönüşür? Çünkü heap'te biriken her nesne, temizlik ekibinin bir gün toplaması gereken bir bardaktır. Modern V8'in çöp toplayıcısı çoğu zaman çok hızlıdır, ama büyük bir toplama turunda ana thread'i durdurur — buna **stop-the-world** denir. Müzik kısılır, herkes durur. O an ekranınızda bir kare düşer.

Bunu gözle görmek için karmaşık araç gerekmez. Chrome DevTools → Performance sekmesinde kaydı başlatın, oyunu birkaç saniye oynayın (parçacıkları bol bol patlatın), kaydı durdurun. İki yere bakın:

- **JS Heap** grafiği tırtıklı bir çizgi çizer: yavaşça tırmanır (bardaklar birikir), sonra dikey olarak düşer (temizlik ekibi süpürdü). Bu tekrarlayan yükseliş-çöküş deseninin adı **sawtooth** (testere dişi). Ne kadar sık ve derin dişler görürseniz, o kadar çok çöp üretiyorsunuz demektir.
- **Frame** şeridinde, her dikey düşüşün hizasında uzayan sarı `GC` blokları ve yanında kırmızıyla işaretlenmiş uzun kareler. İşte o kırmızılar hissettiğiniz takılmalar.

Testere ne kadar keskinse döngü o kadar çöp üretiyor. Hedefimiz o testere dişini düzleştirmek — grafiği yatay bir çizgiye çevirmek. Yani hiç çöp üretmemek.

### Genel Bir Nesne Havuzu

Festival çözümü bellidir: depozitolu bardak. Girişte bir tezgâh var. Temiz bardak alıyorsunuz (`acquire`), içiyorsunuz, işiniz bitince tezgâha iade ediyorsunuz (`release`), tezgâh onu yıkayıp (`reset`) rafa geri koyuyor. Kimse yere bardak atmıyor, temizlik ekibinin süpüreceği bir şey yok.

Nesne havuzu tam olarak bu tezgâhtır. Genel ve tip-güvenli hâlini yazalım:

```ts
// src/pool.ts
export interface PoolOptions<T> {
  create: () => T; // yeni nesne nasıl üretilir
  reset: (obj: T) => void; // iade edilen nesne nasıl temizlenir
  initial?: number; // baştan kaç tane hazır bekletilsin
}

export class Pool<T> {
  private free: T[] = []; // raftaki temiz bardaklar
  private create: () => T;
  private reset: (obj: T) => void;

  created = 0; // toplam kaç bardak ürettik (yüksek su seviyesi)

  constructor(opts: PoolOptions<T>) {
    this.create = opts.create;
    this.reset = opts.reset;
    for (let i = 0; i < (opts.initial ?? 0); i++) {
      this.free.push(this.make());
    }
  }

  private make(): T {
    this.created++;
    return this.create();
  }

  acquire(): T {
    // Rafta bardak varsa onu ver; yoksa yenisini üret.
    return this.free.pop() ?? this.make();
  }

  release(obj: T): void {
    this.reset(obj); // önce yıka
    this.free.push(obj); // sonra rafa koy
  }

  get available(): number {
    return this.free.length;
  }
}
```

Bütün numara `acquire`'daki tek satırda: `this.free.pop() ?? this.make()`. Rafta temiz bardak varsa onu veriyoruz — sıfır ayırma. Ancak raf boşsa, yalnızca o zaman yeni bir tane üretiyoruz.

Bu tek satırın çok hoş bir sonucu var. Havuz, ihtiyacınız olan **en yoğun anda** kaç nesne aynı anda kullanımdaysa, sadece o kadar nesne üretir — sonra bir daha asla. Buna yüksek su seviyesi (high water mark) denir. Sahneniz en çok 400 parçacığı aynı anda gösterdiyse havuz ömrü boyunca 400 nesne üretir. 401.'yi asla. İlk saniyelerde havuz "ısınır", su seviyesine tırmanır, sonra `created` sabitlenir ve ayırma sayacı donar. Testere dişi düz bir çizgiye döner.

`reset` fonksiyonu neden ayrı? Çünkü rafa geri koyduğunuz bardağın *dibinde eski içecek kalmasın* diye. İade edilen bir nesnenin alanları hâlâ eski değerlerini taşır; bir sonraki `acquire` bunu bilmeden alırsa, hayaletlerle tanışırsınız. Birazdan gerçek bir hayalet göstereceğim.

### Parçacık Sistemini Havuza Bağlamak

Havuz hazır. Şimdi emitter'ı `push`+`filter` deseninden söküp tezgâha bağlayalım. İki şey değişecek: doğum anında `new` yerine `acquire`, ölüm anında `filter` yerine `release`.

```ts
// src/particle-system.ts
import { Pool } from "./pool";
import type { Particle } from "./particle";

export class ParticleSystem {
  private pool: Pool<Particle>;
  private active: Particle[] = []; // sahnedeki canlı parçacıklar

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
      const p = this.pool.acquire(); // yeni değil: raftan
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
    // filter YOK. Ölüyü bulunca havuza iade et, yerine sondakini taşı.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;

      if (p.life <= 0) {
        this.pool.release(p); // bardağı iade et
        this.active[i] = this.active[this.active.length - 1]; // swap-remove
        this.active.pop();
      }
    }
  }

  get activeCount(): number {
    return this.active.length;
  }

  // Çizim için canlı parçacıkları gez — kopya/yeni dizi üretmeden (sıfır ayırma).
  get particles(): readonly Particle[] {
    return this.active;
  }

  get allocations(): number {
    return this.pool.created;
  }
}
```

`update`'teki iki satırlık numaraya dikkat: `filter` yerine **swap-remove**. Ölen parçacığı bulunca dizinin sonundaki elemanı onun yerine taşıyıp sonu `pop`'luyoruz. Diziyi geriye doğru (`length - 1`'den `0`'a) gezmemizin sebebi bu: sona taşıdığımız eleman zaten ziyaret ettiğimiz bir indeksten geldiği için hiçbirini atlamıyoruz. `filter`'ın her karede kopyaladığı yeni dizi ortadan kalktı; `active` dizisi tek bir kez ayrılıyor ve kareler boyunca aynı arka bellek yeniden kullanılıyor.

Şimdi vaat ettiğim hayalet. İlk havuz denememde `reset` fonksiyonunda `vy`'yi sıfırlamayı unutmuştum. Küçük bir hata gibi görünür. Ama ölen bir kıvılcım havuza dönüp bir sonraki patlamada yeniden dağıtılınca, `burst` ona yeni bir `vy` atıyordu — sorun yok sandım. Sorun, `reset`'i test edip `burst`'te tüm alanları yeniden yazmadığım bir ara durumdaydı: ekranda arada bir, yeni doğmuş gibi görünüp eski hızıyla ters yöne fırlayan parçacıklar belirdi. Rafa iade edilirken yıkanmamış bardaklar. Havuz kullanmanın bir numaralı kuralı bu yüzden şu: iade ettiğin her alanı sıfırla, yoksa geçmiş seni sahnede rahatsız eder. Testler bölümünde tam bu senaryoyu kırmızıya boyayacağız.

### Sıfır-Ayırmalı Vektörler

Parçacık nesnelerini kurtardık. Ama sıcak döngüde bir çöp kaynağı daha var. Bu daha kurnaz: geçici vektörler.

Fizik yazısındaki `Vec2` yardımcılarını hatırlayın. `add`, `sub`, `scale` — hepsi tertemiz, saf fonksiyonlardı ve *her biri yeni bir nesne döndürüyordu*:

```ts
// ÖNCE — bu kod bu projede YOK, karşı örnek (fizik yazısındaki saf Vec2 yardımcıları)
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
```

Okurken güzel. Entegrasyon döngüsünde ise sessiz bir bardak fabrikası:

```ts
// ÖNCE — bu kod bu projede YOK, karşı örnek (saf fonksiyonlarla entegrasyon)
b.vel = add(b.vel, scale(gravity, dt)); // 2 yeni Vec2
b.pos = add(b.pos, scale(b.vel, dt)); // 2 yeni Vec2 daha
```

Cisim başına, kare başına dört adet geçici `Vec2`. Bin cisimli bir sahnede saniyede 240.000 minik nesne — hepsi bir sonraki satırda çöp. Bu, testere dişinin gizli yakıtıdır.

Çözüm, saf fonksiyonlardan vazgeçip **in-place** (yerinde) işlemlere geçmek. Sonucu yeni bir nesnede döndürmek yerine, çağıranın verdiği bir `out` nesnesine yazarız:

```ts
// src/vec.ts
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

// out = a + b * s  — entegratörün tam kalıbı, tek çağrıda
export function scaleAndAdd(out: Vec2, a: Vec2, b: Vec2, s: number): Vec2 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  return out;
}
```

`out` başka bir argümanla aynı nesne olabilir — bu bir hata değil, tam istediğimiz şey. `scaleAndAdd(b.vel, b.vel, gravity, dt)` çağrısı `b.vel`'i yerinde günceller. Dört satırlık entegrasyon böylece sıfır ayırmaya iner:

```ts
// SONRA — kullanım örneği; bu iki satır bir proje dosyasında değil, çağrı kalıbını gösterir
scaleAndAdd(b.vel, b.vel, gravity, dt); // hız  += yerçekimi * dt
scaleAndAdd(b.pos, b.pos, b.vel, dt); // konum += hız      * dt
```

Cisim başına dört ayırma, sıfıra. Bazen ara sonuçlar için gerçekten geçici bir vektör lazım olur; onu da her karede üretmek yerine döngü dışında bir kez ayrılmış bir **scratch** (çırpı) tamponuyla çözeriz:

```ts
// src/vec.ts (devamı)
const scratch: Vec2 = { x: 0, y: 0 }; // döngü dışında bir kez

export function reflect(vel: Vec2, normal: Vec2): void {
  const d = 2 * (vel.x * normal.x + vel.y * normal.y);
  scaleInPlace(scratch, normal, d); // scratch = normal * d
  vel.x -= scratch.x;
  vel.y -= scratch.y;
}
```

Bir uyarı borçluyum: bu okunabilirlik pahasına gelir. `add(a, b)` gözünüze çarpar, `scaleAndAdd(out, a, b, s)` düşünmenizi ister. Bu yüzden in-place vektörleri her yere değil, yalnızca kanıtlanmış sıcak yola — her karede binlerce kez dönen döngüye — uygularım. Soğuk kodda saf fonksiyonların netliği her zaman kazanır.

### Kazancı Ölçmek

"Daha az çöp üretiyor" bir his; hisle iş yapmayız. Ölçelim. İki sürümü aynı deterministik sahnede çalıştıran bir harness yazıyoruz — broad-phase yazısındaki tohumlu `mulberry32` üreteciyle, her koşuda birebir aynı parçacıklar doğsun diye:

```ts
// src/rng.ts
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

```ts
// src/bench.ts
export interface BenchResult {
  allocations: number; // üretilen Particle nesnesi sayısı
  ms: number; // toplam süre
  survived: number; // sonda hayatta kalan
}
```

Havuzsuz sürüm, ayırdığı her nesneyi tek tek sayar:

```ts
// src/bench.ts (devamı)
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
    particles = particles.filter((p) => p.life > 0); // + kare başına bir dizi
  }

  return {
    allocations,
    ms: performance.now() - t0,
    survived: particles.length,
  };
}
```

Havuzlu sürüm aynı sahneyi `ParticleSystem` ile koşar ve ayırma sayısını havuzdan okur:

```ts
// src/bench.ts (devamı)
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
```

İki sürüm de RNG'yi aynı sırayla tükettiği (parçacık başına üç çağrı) için birebir aynı parçacıkları üretir — karşılaştırma adildir. Yoğun bir sahnede — 3600 kare (60 saniye), her 6 karede bir 60 parçacık patlaması — sonuç şöyle çıkıyor:

| Metrik | Havuzsuz | Havuzlu |
|---|---|---|
| Üretilen nesne (allocations) | 36.000 | 347 |
| Kare başına dizi ayırması | 3.600 | 0 |
| Süre (ms, medyan/5 koşu) | 8,20 | 5,87 |
| Hayatta kalan (survived) | 279 | 279 |

Ayırma sütunu deterministiktir, makineden bağımsızdır: havuzsuz sürüm tam olarak `3600 / 6 × 60 = 36.000` nesne üretir. Havuzlu sürüm ise yalnızca yüksek su seviyesi kadar — o an aynı anda yaşayan en fazla parçacık sayısı olan 347 kadar — üretir, sonra sıfır. Fark iki kat değil, iki *mertebe*. Süre sütunundaki sayılar makineye göre oynar, ama yön hep aynı: daha az çöp, daha az GC, daha kısa süre. `survived` sütununun iki tarafta da eşit çıkması ise karşılaştırmanın adilliğinin kanıtı: iki sürüm aynı parçacıkları doğurup aynılarını öldürdü. Asıl kazanç ortalama sürede bile değil; havuzlu sürümde o testere dişi hiç oluşmadığı için **hiçbir kare stop-the-world molasına takılmaz**. Ortalaması iyi bir oyun değil, en kötü karesi iyi bir oyun akıcı hissettirir.

### Havuzun Gereksiz Olduğu An

Şimdi dürüst olma vakti — çünkü havuz her zaman doğru cevap değildir — size aksini söyleyen bir yazı bir şey satıyordur.

Modern V8'in çöp toplayıcısı **generational** (nesilsel) çalışır. Kısa ömürlü nesneler "young generation" denen ucuz ve hızlı bir bölgede doğar; oradaki toplama son derece verimlidir, çoğu zaman bir milisaniyenin altında. Parçacıklar gibi doğup hemen ölen nesneler bu ucuz bölgenin tam müşterisidir. Kısacası, az sayıda ve kısa ömürlü nesne üretiyorsanız V8 zaten sizin için verimli bir havuz işletiyor — üstelik bedava.

Bu durumda kendi havuzunuz kazanç değil, yük getirir. Hafif bir sahneyi ölçelim — 600 kare, saniyede bir kez 8 parçacık:

| Metrik | Havuzsuz | Havuzlu |
|---|---|---|
| Üretilen nesne | 80 | 8 |
| Süre (ms, medyan/5 koşu) | 0,02 | 0,01 |

Ayırma sayısı yine düşüyor, ama süre? Fark ölçüm gürültüsünün içinde kayboluyor — iki sürüm de yüzde birkaç milisaniye mertebesinde, ve koşudan koşuya sıra değişebiliyor; havuzlu sürüm `acquire`/`release`/`reset` defter tutması yüzünden bazen bir tık *daha yavaş* da çıkıyor. 80 nesne V8'e hiçbir şey ifade etmez. Burada havuz kurmak, iki bardaklık bir ev partisi için depozito tezgâhı, personel ve bulaşık makinesi kiralamaktır. Çöp diye bir sorununuz yokken çöp çözümü kurmuşsunuzdur.

Kuralı şöyle koyuyorum:

- **Havuz kur:** Sıcak döngüde saniyede yüzlerce–binlerce nesne doğup ölüyorsa. Parçacıklar, mermiler, geçici vektörler, ağ paketleri. DevTools'ta gerçekten testere dişi görüyorsan.
- **Havuz kurma:** Az sayıda, uzun ömürlü nesne. Kare başına birkaç ayırma. Testere dişi yoksa. Önce ölç; grafik düzse ortada düzeltecek bir şey yok.

Havuz bir optimizasyondur, her optimizasyon gibi kanıt ister. Önce profille, testere dişini gör, *sonra* tezgâhı kur. Tersi, erken optimizasyonun ders kitabı örneğidir — okunabilirliği, kendini hiç göstermeyecek bir kazanç için feda edersiniz.

### Testler

Havuzun tek işi var ama onu kusursuz yapmak zorunda: doğru nesneyi doğru anda vermek. İki ölümcül hatası olabilir. Ya aynı nesneyi iki kez dağıtır (o zaman iki "farklı" parçacık aynı belleği paylaşır, biri diğerini bozar), ya da iade edileni yıkamadan geri verir (hayalet). İkisini de deterministik testlerle çiviliyoruz:

```ts
// test/pool.test.ts
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
  it("art arda acquire farklı nesneler verir", () => {
    const pool = makePool();
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b); // asla aynı bardağı iki kişiye verme
  });

  it("release edilen nesne bir sonraki acquire'da geri gelir", () => {
    const pool = makePool();
    const a = pool.acquire();
    pool.release(a);
    const b = pool.acquire();
    expect(b).toBe(a); // aynı nesne, rafa dönüp tekrar dağıtıldı
  });

  it("release nesneyi sıfırlar (hayalet yok)", () => {
    const pool = makePool();
    const a = pool.acquire();
    a.value = 42;
    pool.release(a);
    const b = pool.acquire();
    expect(b.value).toBe(0); // dibinde eski içecek kalmadı
  });

  it("yüksek su seviyesine kadar büyür, sonra üretmeyi durdurur", () => {
    const pool = makePool();
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(pool.created).toBe(3);

    pool.release(a);
    pool.release(b);
    pool.release(c);

    // üçünü geri al: hepsi raftan gelmeli, yeni üretim olmamalı
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(pool.created).toBe(3); // su seviyesi sabit
  });
});
```

`release` sonrası `acquire`'ın aynı nesneyi geri vermesi tesadüf değil: `free` bir yığın (stack) ve biz `pop`/`push` kullanıyoruz, yani LIFO. Bu, testleri deterministik yapan küçük ama önemli bir tasarım kararı. Son test ise havuzun kalbini kanıtlar: üç nesne aynı anda kullanımdaysa `created` üçe çıkar, hepsini iade edip tekrar alsak da üçte kalır. Su seviyesi bir daha yükselmez.

Parçacık sistemini de uçtan uca doğrulayalım — ölen parçacık gerçekten havuza dönüyor ve yeniden kullanılıyor mu:

```ts
// test/particle-system.test.ts
import { describe, it, expect } from "vitest";
import { ParticleSystem } from "../src/particle-system";
import { makeRng } from "../src/rng";

describe("ParticleSystem", () => {
  it("ölen parçacığı havuza iade eder ve yeniden kullanır", () => {
    const sys = new ParticleSystem(0);
    const rng = makeRng(1);

    sys.burst(0, 0, 10, rng);
    expect(sys.activeCount).toBe(10);
    expect(sys.allocations).toBe(10); // ilk 10 gerçekten üretildi

    sys.update(100); // dev bir dt: hepsinin life'ı sıfırın altına iner
    expect(sys.activeCount).toBe(0); // hepsi havuza döndü

    sys.burst(0, 0, 10, rng);
    expect(sys.allocations).toBe(10); // hâlâ 10: yeni ayırma YOK, raftan geldi
  });
});
```

Son satır bu yazının bütün tezidir: ikinci patlama tek bir yeni nesne bile üretmiyor. On bardak dağıttık, geri aldık, yıkadık, tekrar dağıttık. Çöp sıfır.

Zero-alloc vektörleri de bir satırlık bir sözleşmeyle bağlayalım — `out`'un dönen referansla aynı olması:

```ts
// test/vec.test.ts
import { describe, it, expect } from "vitest";
import { scaleAndAdd } from "../src/vec";

describe("vec (in-place)", () => {
  it("scaleAndAdd out'u yerinde günceller, yeni nesne üretmez", () => {
    const out = { x: 0, y: 0 };
    const pos = { x: 1, y: 2 };
    const vel = { x: 0, y: 10 };
    const r = scaleAndAdd(out, pos, vel, 0.5); // out = pos + vel*0.5

    expect(r).toBe(out); // dönen değer, verdiğimiz tamponun ta kendisi
    expect(out).toEqual({ x: 1, y: 7 });
  });
});
```

`r` ile `out`'un aynı referans olması (`toBe`), fonksiyonun yeni bir nesne *üretmediğinin* kanıtı. Sıcak döngüde tam da bunu istiyoruz.

### Özetle:

1. Her karede `push({...})` + `filter` deseni iki çöp üretir: doğan her nesne, ve `filter`'ın her karede kopyaladığı yeni dizi. Küçük patlamada zararsız, binlerce parçacıkta GC baskısı.
2. Teşhis gözle yapılır: DevTools Performance'ta JS Heap'in testere dişi (sawtooth) ve GC'nin stop-the-world molalarına takılan kırmızı kareler.
3. `Pool<T>` bir depozito tezgâhıdır: `acquire` raftan verir, `release` yıkayıp geri koyar. Sıfır ayırma, ta ki raf boşalana kadar.
4. Havuz yalnızca yüksek su seviyesi (aynı anda kullanılan en fazla nesne) kadar üretir, sonra `created` donar — testere dişi düzleşir.
5. `filter` yerine swap-remove kullan: ölüyü havuza iade et, sondakini yerine taşı, `pop`'la. Dizi kare boyunca yeniden kullanılır.
6. Sıcak döngüdeki geçici `Vec2`'leri in-place işlemlerle (`scaleAndAdd(out, a, b, s)`) ve scratch tamponlarla sıfıra indir — ama sadece kanıtlanmış sıcak yolda; soğuk kodda okunabilirlik kazanır.
7. `reset`'te her alanı sıfırla, yoksa yıkanmamış bardak hayalet parçacık olur. Testle çivile.
8. Havuz bir optimizasyondur, ölçümle gelir. Modern V8'in nesilsel GC'si az ve kısa ömürlü nesneleri zaten bedava toplar; testere dişi yoksa havuz sadece yük getirir.

Kodun tamamı — havuz, havuzlu parçacık sistemi, in-place vektörler, benchmark harness'i ve testler — GitHub'da; README'deki komutlarla `npm test` diyip testleri yeşile boyayabilir, `npm run bench` diyip iki sürümün ayırma sayılarını kendi terminalinizde görebilirsiniz.

Bu yazıyı yazarken tekrar fark ettiğim şey şu oldu: fizik yazısında "parçacık sistemleri kulağa büyük mühendislik gibi gelir ama bir dizi, bir filtre, üç satır fizikten ibaret" demiştim. Doğruydu — ama o basitliğin bir bedeli varmış, ve bedeli görünene kadar ödediğimizi bile bilmiyorduk. Optimizasyon çoğu zaman böyle: yeni bir şey eklemek değil, hep orada duran bir israfı fark edip geri almak. Bardağı yere atmayı bırakmak.

Festival devam ediyor, müzik hiç kesilmiyor, ve kimse yere tek bardak atmıyor. ⚙️🧠

---

### 🚀 Serinin ve Konunun Devamı
Web oyun motoru mimarisi ve yüksek performanslı veri yapıları serisindeki diğer yazılarımız:
- 📌 **[Metronomlu Fizik: Sabit Adımlı Oyun Döngüsü ve Render Enterpolasyonu](https://medium.com/@mkare)** — *Ekran yenileme hızından bağımsız deterministik fizik ve yumuşak render enterpolasyonu.*
- 📌 **[Sıfırdan Entity Component System: TypeScript'te Kendi ECS'ini Yaz, Sonra bitECS'e Geç](https://medium.com/@mkare)** — *Veri-odaklı mimari (DoD), TypedArray bellek dizilimleri ve binlerce varlığı kasmadan yönetme.*
- 📌 **[Aynı Canvas, İki Ayrı Boyut: devicePixelRatio ile Bulanıklığı Bitirmek](https://medium.com/@mkare)** — *Retina panellerde bulanık pikselleri bitirip jilet gibi keskin tuval kurma rehberi.*

---

### 👋 Yazar Hakkında
Ben **Mustafa Morbel** — 14 yılı aşkın süredir modern web teknolojileri, oyun mimarileri, tarayıcı bellek yönetimi ve yapay zekâ sistemleri üzerine çalışıyorum.

* Sıfır ayırmalı nesne havuzu kodlarını ve benchmark harness'ını incelemek için **[GitHub (@mkare)](https://github.com/mkare)** profilimi ziyaret edebilirsiniz.
* Yeni teknik rehberler ve mimari paylaşımlar için **[LinkedIn](https://linkedin.com/in/mustafamorbel)** ve **[X / Twitter (@mustafamorbel)](https://x.com/mustafamorbel)** üzerinden bağlantı kurabilirsiniz.
* Yoğun animasyon ve oyun döngülerinde GC duraklamalarıyla nasıl başa çıktığınızı yorumlarda paylaşmayı, faydalı bulduysanız 👏 alkışlamayı unutmayın!
