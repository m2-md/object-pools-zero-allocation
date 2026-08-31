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
