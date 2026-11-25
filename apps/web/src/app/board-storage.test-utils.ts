import type { BoardStorage } from './board-storage';

export type MemoryBoardStorage = BoardStorage & {
  values: Map<string, unknown>;
};

export const createMemoryBoardStorage = (): MemoryBoardStorage => {
  const values = new Map<string, unknown>();
  return {
    values,
    async getItem<T>(key: string) {
      return values.has(key) ? (values.get(key) as T) : null;
    },
    async setItem<T>(key: string, value: T) {
      values.set(key, value);
      return value;
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  };
};
