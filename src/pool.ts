export interface PoolOptions<T> {
  create: () => T; // how a new object is produced
  reset: (obj: T) => void; // how a returned object is cleaned
  initial?: number; // how many to keep ready up front
}

export class Pool<T> {
  private free: T[] = []; // the clean glasses on the shelf
  private create: () => T;
  private reset: (obj: T) => void;

  created = 0; // how many glasses we produced in total (high-water mark)

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
    // If there is a glass on the shelf, hand it over; otherwise make a new one.
    return this.free.pop() ?? this.make();
  }

  release(obj: T): void {
    this.reset(obj); // wash it first
    this.free.push(obj); // then put it back on the shelf
  }

  get available(): number {
    return this.free.length;
  }
}
