import { beforeEach, describe, expect, it } from 'vitest';
import { clearChatMessages, loadChatMessages, saveChatMessages } from './chat-session-storage';
import type { ChatMessage } from './llm';

const message = (id: string, content: string): ChatMessage => ({
  id,
  role: 'user',
  content,
  createdAt: 1,
});

describe('chat session storage', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
