import { act, renderHook, waitFor } from '@testing-library/react';
import type { PlaitElement } from '@plait/core';
import { useDrawnixBoardStore } from './board-store';
import { BOARD_KEY_PREFIX, BOARDS_INDEX_KEY, boardValueKey, type BoardMeta } from './board-storage';
import { createMemoryBoardStorage } from './board-storage.test-utils';

const element = { id: 'element-1' } as unknown as PlaitElement;

const setup = async () => {
  const storage = createMemoryBoardStorage();
  const hook = renderHook(() => useDrawnixBoardStore(storage));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return { storage, ...hook };
};

describe('useDrawnixBoardStore', () => {
  it('creates a board and keeps each board value isolated', async () => {
    const { result, storage } = await setup();
    const firstBoard = result.current.boards[0];

    await act(async () => {
      await result.current.createBoard();
    });

    const secondBoardId = result.current.activeBoardId;
    expect(result.current.boards).toHaveLength(2);
    expect(secondBoardId).not.toBe(firstBoard.id);
    expect(result.current.activeBoard?.name).toBe('未命名画布 2');

    act(() => {
      result.current.handleChange({ children: [element] });
    });
    expect(result.current.value.children).toEqual([element]);
    expect(
      (await storage.getItem<{ children: PlaitElement[] }>(boardValueKey(secondBoardId)))?.children
    ).toEqual([element]);

    await act(async () => {
      await result.current.switchBoard(firstBoard.id);
    });
    expect(result.current.activeBoardId).toBe(firstBoard.id);
    expect(result.current.value.children).toEqual([]);

    await act(async () => {
      await result.current.switchBoard(secondBoardId);
    });
    expect(result.current.value.children).toEqual([element]);
  });

  it('renames a board and persists the index', async () => {
    const { result, storage } = await setup();
    const boardId = result.current.activeBoardId;

    act(() => {
      result.current.renameBoard(boardId, '  设计稿  ');
    });

    expect(result.current.activeBoard?.name).toBe('设计稿');
    await waitFor(async () => {
      const boards = await storage.getItem<BoardMeta[]>(BOARDS_INDEX_KEY);
      expect(boards?.[0].name).toBe('设计稿');
    });
  });

  it('switches away when deleting the active board and always keeps one board', async () => {
    const { result, storage } = await setup();
    const firstBoardId = result.current.activeBoardId;

    await act(async () => {
      await result.current.createBoard();
    });
    const secondBoardId = result.current.activeBoardId;

    await act(async () => {
      await result.current.deleteBoard(secondBoardId);
    });

    expect(result.current.boards).toHaveLength(1);
    expect(result.current.activeBoardId).toBe(firstBoardId);
    expect(storage.values.has(`${BOARD_KEY_PREFIX}${secondBoardId}`)).toBe(false);

    await act(async () => {
      await result.current.deleteBoard(firstBoardId);
    });

    expect(result.current.boards).toHaveLength(1);
    expect(result.current.activeBoardId).not.toBe(firstBoardId);
    expect(result.current.value).toEqual({ children: [] });
    expect(result.current.tutorial).toBe(true);
  });

  it('ignores late updates from a board that was switched away or deleted', async () => {
    const { result, storage } = await setup();
    const firstBoardId = result.current.activeBoardId;
    const firstBoardHandleChange = result.current.handleChange;

    await act(async () => {
      await result.current.createBoard();
    });
    const secondBoardId = result.current.activeBoardId;

    act(() => {
      firstBoardHandleChange({ children: [element] });
    });
    expect(
      (await storage.getItem<{ children: PlaitElement[] }>(boardValueKey(firstBoardId)))?.children
    ).toEqual([element]);
    expect(
      (await storage.getItem<{ children: PlaitElement[] }>(boardValueKey(secondBoardId)))?.children
    ).toEqual([]);

    const secondBoardHandleChange = result.current.handleChange;
    await act(async () => {
      await result.current.deleteBoard(secondBoardId);
    });
    act(() => {
      secondBoardHandleChange({ children: [element] });
    });
    expect(storage.values.has(boardValueKey(secondBoardId))).toBe(false);
  });
});
