import { useEffect, useRef, useState } from 'react';
import localforage from 'localforage';
import type { DrawnixToolState } from '@drawnix/drawnix';
import {
  LEGACY_MAIN_BOARD_CONTENT_KEY,
  MAIN_BOARD_PREFERENCE_KEY,
  MAIN_BOARD_TOOL_STATE_KEY,
  createBoardId,
  createBoardMeta,
  createEmptyBoardValue,
  createUntitledBoardName,
  isBoardValueEmpty,
  loadBoardCollection,
  loadBoardValue,
  removeBoardValue,
  saveActiveBoardId,
  saveBoardValue,
  saveBoardsIndex,
  type BoardMeta,
  type BoardStorage,
  type BoardValue,
  type Language,
} from './board-storage';

export type { Language } from './board-storage';
export { MAIN_BOARD_TOOL_STATE_KEY, MAIN_BOARD_PREFERENCE_KEY };

export type AppValue = BoardValue;

export type MainBoardPreference = {
  language: Language;
  copyTransparent: boolean;
  exportTransparent: boolean;
};

export const MAIN_BOARD_CONTENT_KEY = LEGACY_MAIN_BOARD_CONTENT_KEY;

const DEFAULT_PREFERENCE: MainBoardPreference = {
  language: 'zh',
  copyTransparent: false,
  exportTransparent: false,
};

const BOARD_INDEX_SAVE_DELAY = 600;

localforage.config({
  name: 'Drawnix',
  storeName: 'drawnix_store',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

export const useDrawnixBoardStore = (storage: BoardStorage = localforage) => {
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [activeBoardId, setActiveBoardId] = useState('');
  const [value, setValue] = useState<AppValue>(createEmptyBoardValue());
  const [initialToolState, setInitialToolState] = useState<Partial<DrawnixToolState>>();
  const [preference, setPreference] = useState<MainBoardPreference>(DEFAULT_PREFERENCE);
  const [loaded, setLoaded] = useState(false);
  const [tutorial, setTutorial] = useState(false);

  const boardsRef = useRef<BoardMeta[]>([]);
  const activeBoardIdRef = useRef('');
  const deletedBoardIdsRef = useRef(new Set<string>());
  const switchRequestRef = useRef(0);
  const indexSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistBoardsIndex = (nextBoards: BoardMeta[], immediate = false) => {
    boardsRef.current = nextBoards;
    if (indexSaveTimeoutRef.current) {
      clearTimeout(indexSaveTimeoutRef.current);
      indexSaveTimeoutRef.current = null;
    }
    if (immediate) {
      void saveBoardsIndex(storage, nextBoards);
      return;
    }
    indexSaveTimeoutRef.current = setTimeout(() => {
      indexSaveTimeoutRef.current = null;
      void saveBoardsIndex(storage, boardsRef.current);
    }, BOARD_INDEX_SAVE_DELAY);
  };

  const applyBoards = (nextBoards: BoardMeta[], immediate = false) => {
    boardsRef.current = nextBoards;
    setBoards(nextBoards);
    persistBoardsIndex(nextBoards, immediate);
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const [storedToolState, storedPreference] = await Promise.all([
        storage.getItem<Partial<DrawnixToolState>>(MAIN_BOARD_TOOL_STATE_KEY),
        storage.getItem<MainBoardPreference>(MAIN_BOARD_PREFERENCE_KEY),
      ]);
      const nextPreference = storedPreference
        ? { ...DEFAULT_PREFERENCE, ...storedPreference }
        : DEFAULT_PREFERENCE;
      const collection = await loadBoardCollection(storage, nextPreference.language);
      if (cancelled) {
        return;
      }

      activeBoardIdRef.current = collection.activeBoardId;
      boardsRef.current = collection.boards;
      setBoards(collection.boards);
      setActiveBoardId(collection.activeBoardId);
      setValue(collection.value);
      setTutorial(isBoardValueEmpty(collection.value));
      if (storedToolState) {
        setInitialToolState(storedToolState);
      }
      setPreference(nextPreference);
      setLoaded(true);
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    return () => {
      if (indexSaveTimeoutRef.current) {
        clearTimeout(indexSaveTimeoutRef.current);
      }
    };
  }, []);

  const updatePreference = (partialPreference: Partial<MainBoardPreference>) => {
    setPreference((currentPreference) => {
      const nextPreference = { ...currentPreference, ...partialPreference };
      storage.setItem(MAIN_BOARD_PREFERENCE_KEY, nextPreference);
      return nextPreference;
    });
  };

  const handleChange = (nextValue: AppValue) => {
    setValue(nextValue);
    const boardId = activeBoardId;
    if (!boardId || deletedBoardIdsRef.current.has(boardId)) {
      return;
    }
    void saveBoardValue(storage, boardId, nextValue);
    if (!isBoardValueEmpty(nextValue)) {
      setTutorial(false);
    }
    const now = Date.now();
    applyBoards(
      boardsRef.current.map((board) =>
        board.id === boardId ? { ...board, updatedAt: now } : board
      )
    );
  };

  const handleToolStateChange = (toolState: DrawnixToolState) => {
    storage.setItem(MAIN_BOARD_TOOL_STATE_KEY, toolState);
  };

  const createBoard = async () => {
    const id = createBoardId();
    const now = Date.now();
    const meta = createBoardMeta(
      id,
      createUntitledBoardName(boardsRef.current, preference.language),
      now
    );
    const nextBoards = [meta, ...boardsRef.current];
    const nextValue = createEmptyBoardValue();

    await Promise.all([
      saveBoardValue(storage, id, nextValue),
      saveBoardsIndex(storage, nextBoards),
      saveActiveBoardId(storage, id),
    ]);

    switchRequestRef.current += 1;
    activeBoardIdRef.current = id;
    setActiveBoardId(id);
    setValue(nextValue);
    setTutorial(true);
    applyBoards(nextBoards, true);
    return id;
  };

  const switchBoard = async (boardId: string) => {
    if (!boardId || boardId === activeBoardIdRef.current) {
      return;
    }
    const requestId = switchRequestRef.current + 1;
    switchRequestRef.current = requestId;
    const nextValue = await loadBoardValue(storage, boardId);
    if (requestId !== switchRequestRef.current) {
      return;
    }
    activeBoardIdRef.current = boardId;
    setActiveBoardId(boardId);
    setValue(nextValue);
    setTutorial(isBoardValueEmpty(nextValue));
    await saveActiveBoardId(storage, boardId);
  };

  const renameBoard = (boardId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }
    const nextBoards = boardsRef.current.map((board) =>
      board.id === boardId ? { ...board, name: nextName, updatedAt: Date.now() } : board
    );
    applyBoards(nextBoards, true);
  };

  const deleteBoard = async (boardId: string) => {
    deletedBoardIdsRef.current.add(boardId);
    switchRequestRef.current += 1;
    const remainingBoards = boardsRef.current.filter((board) => board.id !== boardId);
    await removeBoardValue(storage, boardId);

    if (boardId !== activeBoardIdRef.current) {
      applyBoards(remainingBoards, true);
      return;
    }

    if (remainingBoards.length > 0) {
      const nextBoard = remainingBoards[0];
      const nextValue = await loadBoardValue(storage, nextBoard.id);
      activeBoardIdRef.current = nextBoard.id;
      setActiveBoardId(nextBoard.id);
      setValue(nextValue);
      setTutorial(isBoardValueEmpty(nextValue));
      applyBoards(remainingBoards, true);
      await saveActiveBoardId(storage, nextBoard.id);
      return;
    }

    const id = createBoardId();
    const meta = createBoardMeta(id, createUntitledBoardName([], preference.language), Date.now());
    const nextValue = createEmptyBoardValue();
    await Promise.all([
      saveBoardValue(storage, id, nextValue),
      saveBoardsIndex(storage, [meta]),
      saveActiveBoardId(storage, id),
    ]);
    activeBoardIdRef.current = id;
    setActiveBoardId(id);
    setValue(nextValue);
    setTutorial(true);
    applyBoards([meta], true);
  };

  const activeBoard = boards.find((board) => board.id === activeBoardId);

  return {
    boards,
    activeBoardId,
    activeBoard,
    loaded,
    value,
    initialToolState,
    preference,
    tutorial,
    setTutorial,
    updatePreference,
    handleChange,
    handleToolStateChange,
    createBoard,
    switchBoard,
    renameBoard,
    deleteBoard,
  };
};
