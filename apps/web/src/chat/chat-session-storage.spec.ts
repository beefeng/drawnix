import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearChatMessages, loadChatMessages, saveChatMessages } from './chat-session-storage';
import type { ChatMessage } from './llm';

const message = (id: string, content: string): ChatMessage => ({
  id,
  role: 'user',
  content,
  createdAt: 1,
});

const image = {
  id: 'image-1',
  dataUrl: 'data:image/png;base64,abc',
  name: '截图.png',
  mimeType: 'image/png',
  width: 320,
  height: 180,
  size: 3,
};

describe('chat session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps conversations isolated by board', () => {
    saveChatMessages('board-a', [message('a-1', '画布 A')]);
    saveChatMessages('board-b', [message('b-1', '画布 B')]);

    expect(loadChatMessages('board-a')).toEqual([message('a-1', '画布 A')]);
    expect(loadChatMessages('board-b')).toEqual([message('b-1', '画布 B')]);
  });

  it('migrates the legacy shared conversation to the first loaded board only', () => {
    localStorage.setItem('drawnix_chat_messages', JSON.stringify([message('legacy', '旧对话')]));

    expect(loadChatMessages('board-a')).toEqual([message('legacy', '旧对话')]);
    expect(loadChatMessages('board-b')).toEqual([]);
    expect(localStorage.getItem('drawnix_chat_messages')).toBeNull();
  });

  it('clears only the requested board conversation', () => {
    saveChatMessages('board-a', [message('a-1', '画布 A')]);
    saveChatMessages('board-b', [message('b-1', '画布 B')]);

    clearChatMessages('board-a');

    expect(loadChatMessages('board-a')).toEqual([]);
    expect(loadChatMessages('board-b')).toEqual([message('b-1', '画布 B')]);
  });

  it('persists pasted images with the board conversation', () => {
    const withImage = { ...message('a-1', '照着这张图画'), images: [image] };

    saveChatMessages('board-a', [withImage]);

    expect(loadChatMessages('board-a')).toEqual([withImage]);
  });

  it('drops historical images before discarding a conversation when storage is full', () => {
    const originalSetItem = Storage.prototype.setItem;
    let attempts = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      attempts++;
      if (attempts === 1) {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    saveChatMessages('board-a', [
      { ...message('a-1', '照着这张图画'), images: [image] },
      message('a-2', '继续画'),
    ]);

    expect(loadChatMessages('board-a')).toEqual([
      { ...message('a-1', '照着这张图画'), omittedImageCount: 1 },
      message('a-2', '继续画'),
    ]);
  });
});
