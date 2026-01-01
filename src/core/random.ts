/**
 * Seeded random number generator using mulberry32
 * Deterministic: same seed always produces same sequence
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    // Convert string seed to number if needed
    if (typeof seed === "string") {
      this.state = this.hashString(seed);
    } else {
      this.state = seed >>> 0; // Ensure 32-bit unsigned integer
    }
  }

  /**
   * Hash a string to a 32-bit integer
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return result;
  }

  /**
   * Generate random integer between min (inclusive) and max (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random number with variance around a base value
   * @param base Base value
   * @param variance Percentage variance (e.g., 20 means ±20%)
   */
  nextWithVariance(base: number, variance: number): number {
    const factor = 1 + ((this.next() * 2 - 1) * variance) / 100;
    return Math.round(base * factor);
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: T[]): T {
    const index = Math.floor(this.next() * array.length);
    return array[index] as T;
  }

  /**
   * Pick a weighted random element
   */
  pickWeighted<T extends { weight: number }>(items: T[]): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = this.next() * totalWeight;

    for (const item of items) {
      random -= item.weight;
      if (random <= 0) {
        return item;
      }
    }

    return items[items.length - 1] as T;
  }

  /**
   * Generate a boolean with given probability of true
   * @param probability Value between 0 and 1
   */
  nextBoolean(probability: number = 0.5): boolean {
    return this.next() < probability;
  }
}
