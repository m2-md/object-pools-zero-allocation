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
