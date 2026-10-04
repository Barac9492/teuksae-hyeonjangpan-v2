import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

// Scheduling tests set their own clock; unrelated tests must not follow live worship hours.
const anchorDefaultClock = () => { vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T12:00:00+09:00')); };
anchorDefaultClock(); // Also anchor fixtures declared at module scope.
beforeEach(anchorDefaultClock);

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: memoryStorage,
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage,
});
