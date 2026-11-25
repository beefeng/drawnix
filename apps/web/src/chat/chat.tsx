import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  Drawnix,
  createDrawnixAgent,
  type DrawnixAgent,
  type DrawnixFileSaveResult,
} from '@drawnix/drawnix';
import { useDrawnixBoardStore } from '../app/board-store';
import { getBoardNameAfterFileSave, getDefaultFileSaveName } from '../app/board-storage';
import {
  DEFAULT_LLM_SETTINGS,
  clearChatMessages,
  loadChatMessages,
  loadLlmSettings,
  runChatTurn,
  saveChatMessages,
  saveLlmSettings,
  testLlmConnection,
  type ChatMessage,
  type LlmSettings,
} from './llm';
import './chat.scss';

const EXAMPLE_PROMPTS = [
  '画一个用户登录流程：访问页面 → 输入账号密码 → 校验 → 登录成功/失败',
  '画一个三层架构图：前端、API 服务、数据库，并标出调用关系',
  '清空画布，然后画一个包含产品、研发、测试、发布的迭代流程',
  '把当前选中的元素改成蓝色，并调整到整齐的横向排列',
];

type ChatThemeMode = 'default' | 'colorful' | 'soft' | 'retro' | 'dark' | 'starry';

const CHAT_PANEL_WIDTH_KEY = 'drawnix_chat_panel_width';
const DEFAULT_PANEL_WIDTH = 430;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;

const getMaxPanelWidth = () => {
  if (typeof window === 'undefined') {
    return MAX_PANEL_WIDTH;
  }
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, window.innerWidth - 360));
};

const clampPanelWidth = (width: number) => {
  return Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(getMaxPanelWidth(), width)));
};

const loadPanelWidth = () => {
  const stored = Number(localStorage.getItem(CHAT_PANEL_WIDTH_KEY));
  return clampPanelWidth(Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_PANEL_WIDTH);
};

const createMessageId = () => {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
};

type ConnectionTestState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
};

export function ChatApp() {
  const {
    loaded,
    activeBoard,
    activeBoardId,
    value,
    initialToolState,
    preference,
    updatePreference,
    handleChange,
    handleToolStateChange,
    renameBoard,
    markBoardFileSaved,
  } = useDrawnixBoardStore();
  const [settings, setSettings] = useState<LlmSettings>(() => loadLlmSettings());
  const [settingsOpen, setSettingsOpen] = useState(() => !loadLlmSettings().apiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatMessages());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({
    status: 'idle',
  });
  const [themeMode, setThemeMode] = useState<ChatThemeMode>(
    () => (value.theme?.themeColorMode as ChatThemeMode) || 'default'
  );
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);
  const [resizingPanel, setResizingPanel] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const agentRef = useRef<DrawnixAgent | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setThemeMode((value.theme?.themeColorMode as ChatThemeMode) || 'default');
  }, [value.theme?.themeColorMode]);

  useEffect(() => {
    localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      setPanelWidth((currentWidth) => clampPanelWidth(currentWidth));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    saveChatMessages(messages);
    const container = messageListRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const updateSettings = (partial: Partial<LlmSettings>) => {
    setConnectionTest({ status: 'idle' });
    setSettings((current) => {
      const next = { ...current, ...partial };
      saveLlmSettings(next);
      return next;
    });
  };

  const handleTestConnection = async () => {
    setConnectionTest({ status: 'testing' });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const result = await testLlmConnection(settings, controller.signal);
      setConnectionTest({
        status: 'success',
        message: `连接成功 · ${result.latencyMs}ms · ${result.reply}`,
      });
    } catch (testError) {
      let message: string;
      if (controller.signal.aborted) {
        message = '连接超时（15 秒），请检查 Base URL 或网络。';
      } else if (testError instanceof Error) {
        message = testError.message;
      } else {
        message = String(testError);
      }
      setConnectionTest({
        status: 'error',
        message,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const submitMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || busy) {
      return;
    }
    const agent = agentRef.current ?? window.drawnixAgent;
    if (!agent) {
      setError('画布还在加载，请稍后再试。');
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };
    const nextMessages = [...messages, userMessage];
    const beforeElementCount = agent.getElements().length;
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setSettingsOpen(false);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runChatTurn({
        agent,
        settings,
        messages: nextMessages,
        signal: controller.signal,
      });
      const shouldFitViewport =
        result.toolNames.includes('新增元素') &&
        (beforeElementCount === 0 || result.toolNames.includes('清空画布'));
      if (shouldFitViewport) {
        try {
          agent.fitViewport();
        } catch {
          // Fitting is a convenience; keep the successful tool result if it fails.
        }
      }
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'assistant',
          content: result.text || '已完成画布操作。',
          createdAt: Date.now(),
        },
      ]);
    } catch (turnError) {
      if (controller.signal.aborted) {
        setMessages((current) => [
          ...current,
          {
            id: createMessageId(),
            role: 'assistant',
            content: '已停止本次操作。',
            createdAt: Date.now(),
          },
        ]);
      } else {
        setError(turnError instanceof Error ? turnError.message : String(turnError));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitMessage(input);
    }
  };

  const stopTurn = () => {
    abortRef.current?.abort();
  };

  const handlePanelResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = {
      startX: event.clientX,
      startWidth: panelWidth,
    };
    setResizingPanel(true);
  };

  const handlePanelResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    const resizeStart = resizeStartRef.current;
    if (!resizeStart) {
      return;
    }
    setPanelWidth(clampPanelWidth(resizeStart.startWidth + (resizeStart.startX - event.clientX)));
  };

  const handlePanelResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) {
      return;
    }
    resizeStartRef.current = null;
    setResizingPanel(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePanelResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPanelWidth((currentWidth) => clampPanelWidth(currentWidth + 24));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPanelWidth((currentWidth) => clampPanelWidth(currentWidth - 24));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH));
    }
  };

  const clearConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    clearChatMessages();
  };

  if (!loaded) {
    return null;
  }

  const handleFileSaved = (result: DrawnixFileSaveResult) => {
    if (!result.fileName || !activeBoard) {
      return;
    }
    const nextName = getBoardNameAfterFileSave(activeBoard.name, result.fileName, result.isNewFile);
    if (nextName !== activeBoard.name) {
      renameBoard(activeBoardId, nextName);
    }
    markBoardFileSaved(activeBoardId, result.fileName);
  };

  return (
    <div
      className={`chat-page chat-theme--${themeMode} ${resizingPanel ? 'chat-page--resizing' : ''}`}
      style={{ '--chat-panel-width': `${panelWidth}px` } as CSSProperties}
    >
      <div className="chat-board">
        <Drawnix
          value={value.children}
          viewport={value.viewport}
          theme={value.theme}
          initialToolState={initialToolState}
          initialLanguage={preference.language}
          defaultFileName={
            activeBoard ? getDefaultFileSaveName(activeBoard, preference.language) : undefined
          }
          initialPreference={{
            copyTransparent: preference.copyTransparent,
            exportTransparent: preference.exportTransparent,
          }}
          onLanguageChange={(language) => updatePreference({ language })}
          onPreferenceChange={({ copyTransparent, exportTransparent }) => {
            updatePreference({ copyTransparent, exportTransparent });
          }}
          onChange={(nextValue) => {
            handleChange(nextValue as Parameters<typeof handleChange>[0]);
          }}
          onToolStateChange={handleToolStateChange}
          onThemeChange={(nextTheme) => setThemeMode(nextTheme as ChatThemeMode)}
          tutorial={false}
          onFileSaved={handleFileSaved}
          agent
          afterInit={(board) => {
            agentRef.current = createDrawnixAgent(board);
            setAgentReady(true);
          }}
        />
      </div>

      <div
        className="chat-resizer"
        role="separator"
        aria-label="调整对话面板宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={getMaxPanelWidth()}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onPointerDown={handlePanelResizeStart}
        onPointerMove={handlePanelResizeMove}
        onPointerUp={handlePanelResizeEnd}
        onPointerCancel={handlePanelResizeEnd}
        onKeyDown={handlePanelResizeKeyDown}
        onDoubleClick={() => setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH))}
      >
        <span />
      </div>

      <aside className="chat-panel">
        <header className="chat-header">
          <a className="chat-back" href="#/" aria-label="返回画布">
            <span aria-hidden="true">←</span>
            画布
          </a>
          <div className="chat-title">
            <span className="chat-eyebrow">DRAWNIX AGENT</span>
            <h1>对话画布</h1>
          </div>
          <button
            className="chat-icon-button"
            type="button"
            aria-label="模型设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm8-2.45v-1.5l-2.05-.72a6.5 6.5 0 0 0-.63-1.52l.98-1.95-1.06-1.06-1.95.98a6.5 6.5 0 0 0-1.52-.63L13 4h-2l-.72 2.05a6.5 6.5 0 0 0-1.52.63l-1.95-.98-1.06 1.06.98 1.95a6.5 6.5 0 0 0-.63 1.52L4 11.25v1.5l2.05.72c.14.54.35 1.05.63 1.52l-.98 1.95 1.06 1.06 1.95-.98c.47.28.98.49 1.52.63L11 20h2l.72-2.05a6.5 6.5 0 0 0 1.52-.63l1.95.98 1.06-1.06-.98-1.95c.28-.47.49-.98.63-1.52L20 12.75Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </header>

        {settingsOpen && (
          <section className="chat-settings" aria-label="模型设置">
            <div className="chat-settings__row">
              <label htmlFor="llm-base-url">Base URL</label>
              <input
                id="llm-base-url"
                value={settings.baseUrl}
                placeholder={DEFAULT_LLM_SETTINGS.baseUrl}
                onChange={(event) => updateSettings({ baseUrl: event.target.value })}
              />
            </div>
            <div className="chat-settings__row">
              <label htmlFor="llm-model">Model</label>
              <input
                id="llm-model"
                value={settings.model}
                placeholder={DEFAULT_LLM_SETTINGS.model}
                onChange={(event) => updateSettings({ model: event.target.value })}
              />
            </div>
            <div className="chat-settings__row">
              <label htmlFor="llm-api-key">API Key</label>
              <div className="chat-secret">
                <input
                  id="llm-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  placeholder="sk-..."
                  autoComplete="off"
                  onChange={(event) => updateSettings({ apiKey: event.target.value })}
                />
                <button type="button" onClick={() => setShowApiKey((shown) => !shown)}>
                  {showApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
            <div className="chat-settings__test-row">
              <button
                className="chat-settings__test-button"
                type="button"
                disabled={connectionTest.status === 'testing'}
                onClick={() => void handleTestConnection()}
              >
                {connectionTest.status === 'testing' ? (
                  <>
                    <span className="chat-settings__spinner" />
                    测试中…
                  </>
                ) : (
                  '测试连接'
                )}
              </button>
              {connectionTest.message && (
                <span
                  className={`chat-settings__test-result chat-settings__test-result--${connectionTest.status}`}
                  title={connectionTest.message}
                >
                  {connectionTest.message}
                </span>
              )}
            </div>
            <p className="chat-settings__note">
              配置仅保存在本机浏览器。兼容 OpenAI Chat Completions + Tool Calling 的接口均可使用；
              127.0.0.1 / localhost 接口会通过本地服务代理转发，公开环境建议使用自己的代理地址。
            </p>
          </section>
        )}

        <div className="chat-messages" ref={messageListRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty__mark">✦</div>
              <h2>直接说，直接画</h2>
              <p>描述你想要的图，我会读取画布并调用工具完成。</p>
              <div className="chat-examples">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={`chat-message chat-message--${message.role}`}>
                <div className="chat-message__meta">
                  {message.role === 'user' ? 'YOU' : 'AGENT'}
                </div>
                <div className="chat-message__body">{message.content}</div>
              </article>
            ))
          )}

          {busy && (
            <div className="chat-thinking" role="status">
              <span />
              <span />
              <span />
              正在读取画布并操作
            </div>
          )}

          {error && (
            <div className="chat-error" role="alert">
              <strong>请求失败</strong>
              <span>{error}</span>
              <button type="button" onClick={() => setSettingsOpen(true)}>
                检查模型设置
              </button>
            </div>
          )}
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={input}
            rows={2}
            placeholder={agentReady ? '例如：画一个用户登录流程…' : '画布加载中…'}
            disabled={!agentReady}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="chat-composer__actions">
            <span>Enter 发送 · Shift+Enter 换行</span>
            {busy ? (
              <button className="chat-stop" type="button" onClick={stopTurn}>
                停止
              </button>
            ) : (
              <button type="submit" disabled={!input.trim() || !agentReady}>
                发送
              </button>
            )}
          </div>
        </form>

        <footer className="chat-footer">
          <span className={agentReady ? 'chat-status chat-status--ready' : 'chat-status'}>
            {agentReady ? '画布已连接' : '连接画布中'}
          </span>
          <button type="button" onClick={clearConversation}>
            清空对话
          </button>
        </footer>
      </aside>
    </div>
  );
}

export default ChatApp;
