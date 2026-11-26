import type { PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import { clearChatMessages } from '../chat/chat-session-storage';

export type Language = 'zh' | 'en' | 'ru' | 'ar' | 'vi';

export type BoardValue = {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
};

export type BoardMeta = {
  id: string;
  name: string;
  fileName?: string;
  createdAt: number;
  updatedAt: number;
};

export type BoardCollection = {
  boards: BoardMeta[];
  activeBoardId: string;
  value: BoardValue;
};

export type BoardStorage = {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
};

export const BOARDS_INDEX_KEY = 'boards_index';
export const ACTIVE_BOARD_ID_KEY = 'active_board_id';
export const BOARD_KEY_PREFIX = 'board:';
export const LEGACY_MAIN_BOARD_CONTENT_KEY = 'main_board_content';
export const MAIN_BOARD_TOOL_STATE_KEY = 'main_board_tool_state';
export const MAIN_BOARD_PREFERENCE_KEY = 'main_board_preference';

const DEFAULT_BOARD_ID = 'board-default';

const UNTITLED_BOARD_NAMES: Record<Language, string> = {
  zh: '未命名画布',
  en: 'Untitled canvas',
  ru: 'Новая доска',
  ar: 'لوحة جديدة',
  vi: 'Bảng mới',
};

const MIGRATED_BOARD_NAMES: Record<Language, string> = {
  zh: '我的画布',
  en: 'My canvas',
  ru: 'Моя доска',
  ar: 'لوحتي',
  vi: 'Bảng của tôi',
};

const BOARD_FILE_NAME_PREFIXES: Record<Language, string> = {
  zh: '画布',
  en: 'Canvas',
  ru: 'Доска',
  ar: 'لوحة',
  vi: 'Bảng',
};

export const boardValueKey = (boardId: string) => `${BOARD_KEY_PREFIX}${boardId}`;

export const createBoardId = () => {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId
    ? `board-${randomId}`
    : `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createEmptyBoardValue = (): BoardValue => ({ children: [] });

export const isBoardValueEmpty = (value: BoardValue) => {
  return !value.children || value.children.length === 0;
};

const normalizeBoardValue = (value: unknown): BoardValue => {
  if (!value || typeof value !== 'object') {
    return createEmptyBoardValue();
  }
  const candidate = value as Partial<BoardValue>;
  return {
    children: Array.isArray(candidate.children) ? candidate.children : [],
    viewport: candidate.viewport,
    theme: candidate.theme,
  };
};

const normalizeBoards = (value: unknown): BoardMeta[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Partial<BoardMeta> => Boolean(item) && typeof item === 'object')
    .filter((item) => typeof item.id === 'string' && item.id.length > 0)
    .map((item) => {
      const now = Date.now();
      return {
        id: item.id as string,
        name:
          typeof item.name === 'string' && item.name.trim().length > 0
            ? item.name.trim()
            : UNTITLED_BOARD_NAMES.zh,
        fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
      };
    });
};

export const createUntitledBoardName = (boards: BoardMeta[], language: Language = 'zh') => {
  const baseName = UNTITLED_BOARD_NAMES[language] ?? UNTITLED_BOARD_NAMES.zh;
  const names = new Set(boards.map((board) => board.name));
  if (!names.has(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};

export const isUntitledBoardName = (name: string) => {
  return Object.values(UNTITLED_BOARD_NAMES).some((baseName) => {
    if (name === baseName) {
      return true;
    }
    return name.startsWith(`${baseName} `) && /^\d+$/.test(name.slice(baseName.length + 1));
  });
};

export const getBoardNameAfterFileSave = (
  currentName: string,
  fileName: string | undefined,
  isNewFile: boolean
) => {
  if (!isNewFile || !fileName) {
    return currentName;
  }
  return isUntitledBoardName(currentName) ? fileName : currentName;
};

export const getDefaultFileSaveName = (board: BoardMeta, language: Language = 'zh') => {
  if (!isUntitledBoardName(board.name)) {
    return board.name;
  }
  const date = new Date(board.createdAt || Date.now());
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}`,
  ].join(' ');
  return `${BOARD_FILE_NAME_PREFIXES[language] ?? BOARD_FILE_NAME_PREFIXES.zh} ${timestamp}`;
};

export const removeOlderUntitledBoards = (boards: BoardMeta[]) => {
  let latestUntitled: BoardMeta | undefined;
  boards.forEach((board) => {
    if (
      isUntitledBoardName(board.name) &&
      (!latestUntitled || board.createdAt > latestUntitled.createdAt)
    ) {
      latestUntitled = board;
    }
  });

  if (!latestUntitled) {
    return { boards, removedIds: [] as string[], latestUntitledId: undefined };
  }

  const removedIds = boards
    .filter((board) => isUntitledBoardName(board.name) && board.id !== latestUntitled?.id)
    .map((board) => board.id);
  const removedIdSet = new Set(removedIds);
  return {
    boards: boards.filter((board) => !removedIdSet.has(board.id)),
    removedIds,
    latestUntitledId: latestUntitled.id,
  };
};

export const removeAllUntitledBoards = (boards: BoardMeta[]) => {
  const removedIds = boards
    .filter((board) => isUntitledBoardName(board.name))
    .map((board) => board.id);
  const removedIdSet = new Set(removedIds);
  return {
    boards: boards.filter((board) => !removedIdSet.has(board.id)),
    removedIds,
  };
};

export const createBoardMeta = (id: string, name: string, timestamp = Date.now()): BoardMeta => ({
  id,
  name,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const loadBoardValue = async (
  storage: BoardStorage,
  boardId: string
): Promise<BoardValue> => {
  const value = await storage.getItem<BoardValue>(boardValueKey(boardId));
  return normalizeBoardValue(value);
};

export const saveBoardValue = async (storage: BoardStorage, boardId: string, value: BoardValue) => {
  await storage.setItem(boardValueKey(boardId), value);
};

export const saveBoardsIndex = async (storage: BoardStorage, boards: BoardMeta[]) => {
  await storage.setItem(BOARDS_INDEX_KEY, boards);
};

export const saveActiveBoardId = async (storage: BoardStorage, boardId: string) => {
  await storage.setItem(ACTIVE_BOARD_ID_KEY, boardId);
};

export const removeBoardValue = async (storage: BoardStorage, boardId: string) => {
  await storage.removeItem(boardValueKey(boardId));
  clearChatMessages(boardId);
};

/**
 * Loads the canvas collection and migrates the legacy single-canvas record on
 * first run. The initial board id is deterministic so concurrent first loads
 * (for example React StrictMode) cannot create duplicate boards.
 */
export const loadBoardCollection = async (
  storage: BoardStorage,
  language: Language = 'zh'
): Promise<BoardCollection> => {
  const [storedBoards, storedActiveBoardId, legacyValue] = await Promise.all([
    storage.getItem<BoardMeta[]>(BOARDS_INDEX_KEY),
    storage.getItem<string>(ACTIVE_BOARD_ID_KEY),
    storage.getItem<BoardValue>(LEGACY_MAIN_BOARD_CONTENT_KEY),
  ]);

  const normalizedBoards = normalizeBoards(storedBoards);
  const { boards, removedIds, latestUntitledId } = removeOlderUntitledBoards(normalizedBoards);
  if (removedIds.length > 0) {
    await Promise.all([
      saveBoardsIndex(storage, boards),
      ...removedIds.map((boardId) => removeBoardValue(storage, boardId)),
    ]);
  }
  if (boards.length > 0) {
    const activeBoardId =
      storedActiveBoardId && boards.some((board) => board.id === storedActiveBoardId)
        ? storedActiveBoardId
        : removedIds.length > 0 && latestUntitledId
          ? latestUntitledId
          : boards[0].id;
    const value = await loadBoardValue(storage, activeBoardId);
    if (activeBoardId !== storedActiveBoardId) {
      await saveActiveBoardId(storage, activeBoardId);
    }
    return { boards, activeBoardId, value };
  }

  const hasLegacyContent = Boolean(legacyValue);
  const name = hasLegacyContent
    ? (MIGRATED_BOARD_NAMES[language] ?? MIGRATED_BOARD_NAMES.zh)
    : (UNTITLED_BOARD_NAMES[language] ?? UNTITLED_BOARD_NAMES.zh);
  const initialBoard = createBoardMeta(DEFAULT_BOARD_ID, name);
  const initialValue = normalizeBoardValue(legacyValue);

  await Promise.all([
    saveBoardValue(storage, initialBoard.id, initialValue),
    saveBoardsIndex(storage, [initialBoard]),
    saveActiveBoardId(storage, initialBoard.id),
  ]);

  return {
    boards: [initialBoard],
    activeBoardId: initialBoard.id,
    value: initialValue,
  };
};
