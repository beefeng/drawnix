import type { PlaitElement } from '@plait/core';
import {
  ACTIVE_BOARD_ID_KEY,
  BOARDS_INDEX_KEY,
  LEGACY_MAIN_BOARD_CONTENT_KEY,
  createUntitledBoardName,
  getBoardNameAfterFileSave,
  getDefaultFileSaveName,
  isUntitledBoardName,
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

  it('drops older untitled boards and keeps the latest one on load', async () => {
    const storage = createMemoryBoardStorage();
    const boards = [
      board('old', '未命名画布', 1),
      board('named', '设计稿', 2),
      board('latest', '未命名画布 2', 3),
    ];
    await storage.setItem(BOARDS_INDEX_KEY, boards);
    await storage.setItem(ACTIVE_BOARD_ID_KEY, 'old');
    await storage.setItem('board:old', { children: [element] });
    await storage.setItem('board:latest', { children: [] });

    const collection = await loadBoardCollection(storage);

    expect(collection.boards.map((item) => item.id)).toEqual(['named', 'latest']);
    expect(collection.activeBoardId).toBe('latest');
    expect(storage.values.has('board:old')).toBe(false);
    expect(await storage.getItem(ACTIVE_BOARD_ID_KEY)).toBe('latest');
  });

  it('generates unique untitled board names', () => {
    expect(createUntitledBoardName([])).toBe('未命名画布');
    expect(
      createUntitledBoardName([board('one', '未命名画布'), board('two', '未命名画布 2')])
    ).toBe('未命名画布 3');
    expect(createUntitledBoardName([], 'en')).toBe('Untitled canvas');
  });

  it('detects untitled board names across UI languages', () => {
    expect(isUntitledBoardName('未命名画布')).toBe(true);
    expect(isUntitledBoardName('未命名画布 3')).toBe(true);
    expect(isUntitledBoardName('Untitled canvas 2')).toBe(true);
    expect(isUntitledBoardName('设计稿')).toBe(false);
    expect(isUntitledBoardName('未命名画布草稿')).toBe(false);
    expect(isUntitledBoardName('未命名画布 草稿')).toBe(false);
  });

  it('adopts the saved file name for untitled canvases only', () => {
    expect(getBoardNameAfterFileSave('未命名画布', '项目规划', true)).toBe('项目规划');
    expect(getBoardNameAfterFileSave('未命名画布 2', '项目规划', true)).toBe('项目规划');
    expect(getBoardNameAfterFileSave('设计稿', '项目规划', true)).toBe('设计稿');
    expect(getBoardNameAfterFileSave('未命名画布', '项目规划', false)).toBe('未命名画布');
  });

  it('builds a stable file save name for untitled canvases', () => {
    const createdAt = new Date(2026, 10, 25, 9, 30).getTime();
    const untitled = board('one', '未命名画布 2', createdAt);

    expect(getDefaultFileSaveName(untitled)).toMatch(/^画布 \d{4}-\d{2}-\d{2} \d{2}-\d{2}$/);
    expect(getDefaultFileSaveName({ ...untitled, name: '设计稿' })).toBe('设计稿');
    expect(getDefaultFileSaveName(untitled, 'en')).toMatch(
      /^Canvas \d{4}-\d{2}-\d{2} \d{2}-\d{2}$/
    );
  });
});
