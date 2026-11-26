import type { ChatMessage } from './llm';

const CHAT_MESSAGES_KEY_PREFIX = 'drawnix_chat_messages:';
const LEGACY_CHAT_MESSAGES_KEY = 'drawnix_chat_messages';
const MAX_PERSISTED_MESSAGES = 80;
const MIN_PERSISTED_MESSAGES = 20;

const getChatMessagesKey = (boardId: string) => `${CHAT_MESSAGES_KEY_PREFIX}${boardId}`;

const parseChatMessages = (stored: string | null): ChatMessage[] | null => {
  if (stored === null) {
    return null;
  }
  try {
    const messages = JSON.parse(stored);
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
};

export const loadChatMessages = (boardId: string): ChatMessage[] => {
  if (!boardId) {
    return [];
  }
  try {
    const boardMessages = parseChatMessages(localStorage.getItem(getChatMessagesKey(boardId)));
    if (boardMessages !== null) {
      return boardMessages;
    }

    const legacyMessages = parseChatMessages(localStorage.getItem(LEGACY_CHAT_MESSAGES_KEY));
    if (legacyMessages === null) {
      return [];
    }
    localStorage.setItem(getChatMessagesKey(boardId), JSON.stringify(legacyMessages));
    localStorage.removeItem(LEGACY_CHAT_MESSAGES_KEY);
    return legacyMessages;
  } catch {
    return [];
  }
};

export const saveChatMessages = (boardId: string, messages: ChatMessage[]) => {
  if (!boardId) {
    return;
  }
  const persistable = messages.filter(
    (message) => message.role === 'user' || message.content.trim().length > 0
  );
  const storageKey = getChatMessagesKey(boardId);
  const nextMessages = persistable.slice(-MAX_PERSISTED_MESSAGES);
  const write = () => {
    localStorage.setItem(storageKey, JSON.stringify(nextMessages));
  };
  try {
    write();
    return;
  } catch {
    // localStorage 配额通常被粘贴的图片占满，从最早的图片开始降级保存。
  }

  for (let index = 0; index < nextMessages.length; index++) {
    const message = nextMessages[index];
    if (!message.images?.length) {
      continue;
    }
    nextMessages[index] = {
      ...message,
      images: undefined,
      omittedImageCount: (message.omittedImageCount ?? 0) + message.images.length,
    };
    try {
      write();
      return;
    } catch {
      // 继续清理下一张历史图片。
    }
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(nextMessages.slice(-MIN_PERSISTED_MESSAGES)));
  } catch {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Storage can be unavailable; keep the in-memory conversation usable.
    }
  }
};

export const clearChatMessages = (boardId: string) => {
  if (!boardId) {
    return;
  }
  try {
    localStorage.removeItem(getChatMessagesKey(boardId));
    localStorage.removeItem(LEGACY_CHAT_MESSAGES_KEY);
  } catch {
    // Ignore storage failures while clearing an in-memory conversation.
  }
};
