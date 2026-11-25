import type { PlaitElement } from '@plait/core';
import {
  ACTIVE_BOARD_ID_KEY,
  BOARDS_INDEX_KEY,
  LEGACY_MAIN_BOARD_CONTENT_KEY,
  createUntitledBoardName,
  loadBoardCollection,
  type BoardMeta,
} from './board-storage';
import { createMemoryBoardStorage } from './board-storage.test-utils';

const element = { id: 'element-1' } as unknown as PlaitElement;

const board = (id: string, name: string, updatedAt = 1): BoardMeta => ({
  id,
  name,
  createdAt: updatedAt,
  updatedAt,
});

describe('board storage', () => {
  it('creates an initial blank board', async () => {
    const storage = createMemoryBoardStorage();

    const collection = await loadBoardCollection(storage);

    expect(collection.boards).toHaveLength(1);
    expect(collection.boards[0].name).toBe('未命名画布');
    expect(collection.activeBoardId).toBe(collection.boards[0].id);
    expect(collection.value).toEqual({ children: [] });
    expect(await storage.getItem(ACTIVE_BOARD_ID_KEY)).toBe(collection.activeBoardId);
    expect(await storage.getItem(BOARDS_INDEX_KEY)).toEqual(collection.boards);
  });

  it('migrates the legacy single board and keeps it as a backup', async () => {
    const storage = createMemoryBoardStorage();
    const legacyValue = {
      children: [element],
      viewport: { zoom: 1.5 },
    };
    await storage.setItem(LEGACY_MAIN_BOARD_CONTENT_KEY, legacyValue);

    const collection = await loadBoardCollection(storage, 'zh');

    expect(collection.boards).toHaveLength(1);
    expect(collection.boards[0].name).toBe('我的画布');
    expect(collection.value).toEqual(legacyValue);
    expect(await storage.getItem(LEGACY_MAIN_BOARD_CONTENT_KEY)).toEqual(legacyValue);
  });

  it('restores the stored active board and repairs an invalid active id', async () => {
    const storage = createMemoryBoardStorage();
    const boards = [board('one', '需求梳理'), board('two', '架构设计', 2)];
    await storage.setItem(BOARDS_INDEX_KEY, boards);
    await storage.setItem(ACTIVE_BOARD_ID_KEY, 'two');
    await storage.setItem('board:two', { children: [element] });

    const collection = await loadBoardCollection(storage);
    expect(collection.activeBoardId).toBe('two');
    expect(collection.value.children).toHaveLength(1);

    await storage.setItem(ACTIVE_BOARD_ID_KEY, 'missing');
    const repaired = await loadBoardCollection(storage);
    expect(repaired.activeBoardId).toBe('one');
    expect(await storage.getItem(ACTIVE_BOARD_ID_KEY)).toBe('one');
  });

  it('generates unique untitled board names', () => {
    expect(createUntitledBoardName([])).toBe('未命名画布');
    expect(
      createUntitledBoardName([board('one', '未命名画布'), board('two', '未命名画布 2')])
    ).toBe('未命名画布 3');
    expect(createUntitledBoardName([], 'en')).toBe('Untitled canvas');
  });
});
