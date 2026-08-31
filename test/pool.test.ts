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
