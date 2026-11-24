import type {
  DrawnixAgent,
  DrawnixAgentElementInput,
  DrawnixAgentElementUpdate,
  DrawnixAgentOperationResult,
} from '@drawnix/drawnix';

export type LlmSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OpenAiResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
};

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
};

const LLM_SETTINGS_KEY = 'drawnix_chat_llm_settings';
const CHAT_MESSAGES_KEY = 'drawnix_chat_messages';
const MAX_TOOL_ROUNDS = 5;
const LLM_PROXY_PATH = '/__drawnix_llm_proxy';

const TOOL_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'get_document',
      description: '获取当前画布的元素、视口、主题和选中元素 ID。操作前不确定内容时先调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_elements',
      description:
        '向画布新增形状、文本和箭头。同一批中可以先放形状，再用 from/to 的 elementId 创建绑定箭头。',
      parameters: {
        type: 'object',
        properties: {
          elements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  description: '默认为 shape；箭头必须传 arrow。',
                },
                id: {
                  type: 'string',
                  description: '可选且必须唯一，便于后续更新和箭头绑定。',
                },
                shape: {
                  type: 'string',
                  description:
                    '形状：rectangle、ellipse、diamond、roundRectangle、triangle、process、decision、database 等；箭头：straight、curve、elbow。',
                },
                x: { type: 'number', description: '左上角画布坐标 X。' },
                y: { type: 'number', description: '左上角画布坐标 Y。' },
                width: { type: 'number' },
                height: { type: 'number' },
                text: { type: 'string' },
                fill: { type: 'string', description: '背景色，如 #e3f2fd。' },
                strokeColor: { type: 'string' },
                strokeWidth: { type: 'number' },
                strokeStyle: {
                  type: 'string',
                  description: 'solid、dashed 或 dotted。',
                },
                textAlign: {
                  type: 'string',
                  description: 'left、center 或 right。',
                },
                fontSize: { type: 'number' },
                from: {
                  type: 'object',
                  description: '箭头起点，支持 { elementId, side? } 或 { x, y }。',
                  properties: {
                    elementId: { type: 'string' },
                    side: { type: 'string', description: 'top、right、bottom 或 left。' },
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                },
                to: {
                  type: 'object',
                  description: '箭头终点，支持 { elementId, side? } 或 { x, y }。',
                  properties: {
                    elementId: { type: 'string' },
                    side: { type: 'string', description: 'top、right、bottom 或 left。' },
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                },
                points: {
                  type: 'array',
                  description: '可选的自定义箭头路径，格式为 [[x, y], [x, y]]。',
                  items: {
                    type: 'array',
                    items: { type: 'number' },
                  },
                },
                targetMarker: {
                  type: 'string',
                  description: '箭头终点样式，默认 arrow。',
                },
              },
              required: ['kind'],
            },
          },
        },
        required: ['elements'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_elements',
      description: '按元素 ID 更新位置、尺寸、文本、颜色和箭头路径。',
      parameters: {
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
                points: {
                  type: 'array',
                  items: {
                    type: 'array',
                    items: { type: 'number' },
                  },
                },
                text: { type: 'string' },
                fill: { type: 'string' },
                strokeColor: { type: 'string' },
                strokeWidth: { type: 'number' },
                strokeStyle: { type: 'string' },
                opacity: { type: 'number' },
                angle: { type: 'number' },
              },
              required: ['id'],
            },
          },
        },
        required: ['updates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_elements',
      description: '按元素 ID 删除元素。',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_elements',
      description: '选中指定 ID 的元素。',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_canvas',
      description: '清空整个画布。仅在用户明确要求时使用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_viewport',
      description: '设置画布原点和缩放。',
      parameters: {
        type: 'object',
        properties: {
          origination: {
            type: 'array',
            items: { type: 'number' },
          },
          zoom: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fit_viewport',
      description: '缩放并移动到适合查看全部画布内容。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'undo',
      description: '撤销上一步画布操作。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'redo',
      description: '重做上一步撤销操作。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
] as const;

const TOOL_LABELS: Record<string, string> = {
  get_document: '读取画布',
  add_elements: '新增元素',
  update_elements: '更新元素',
  delete_elements: '删除元素',
  select_elements: '选中元素',
  clear_canvas: '清空画布',
  set_viewport: '调整视口',
  fit_viewport: '适应画布',
  undo: '撤销',
  redo: '重做',
};

const getElementText = (value: unknown) => {
  const element = value as {
    text?: unknown;
    texts?: Array<{ text?: unknown }>;
  };
  const readText = (value: unknown): string => {
    const text = value as { children?: Array<{ text?: string }> } | undefined;
    return text?.children?.map((child) => child.text ?? '').join('') ?? '';
  };
  return readText(element.text) || readText(element.texts?.[0]?.text);
};

export const loadLlmSettings = (): LlmSettings => {
  try {
    const stored = localStorage.getItem(LLM_SETTINGS_KEY);
    if (!stored) {
      return { ...DEFAULT_LLM_SETTINGS };
    }
    return { ...DEFAULT_LLM_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
};

export const saveLlmSettings = (settings: LlmSettings) => {
  localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(settings));
};

export const loadChatMessages = (): ChatMessage[] => {
  try {
    const stored = localStorage.getItem(CHAT_MESSAGES_KEY);
    if (!stored) {
      return [];
    }
    const messages = JSON.parse(stored);
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
};

export const saveChatMessages = (messages: ChatMessage[]) => {
  localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages.slice(-80)));
};

export const clearChatMessages = () => {
  localStorage.removeItem(CHAT_MESSAGES_KEY);
};

const normalizeEndpoint = (baseUrl: string) => {
  const trimmed = (baseUrl || DEFAULT_LLM_SETTINGS.baseUrl).replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
};

const isLoopbackHost = (hostname: string) => {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.')
  );
};

const resolveRequestTarget = (baseUrl: string) => {
  const endpoint = normalizeEndpoint(baseUrl);
  if (typeof window === 'undefined') {
    return { url: endpoint, viaProxy: false };
  }
  try {
    const target = new URL(endpoint, window.location.href);
    if (isLoopbackHost(target.hostname) && target.origin !== window.location.origin) {
      return {
        url: `${window.location.origin}${LLM_PROXY_PATH}?url=${encodeURIComponent(target.href)}`,
        viaProxy: true,
      };
    }
  } catch {
    // Let fetch surface the invalid endpoint error.
  }
  return { url: endpoint, viaProxy: false };
};

const isOpenAiEndpoint = (baseUrl: string) => {
  try {
    return /(^|\.)openai\.com/i.test(new URL(normalizeEndpoint(baseUrl)).hostname);
  } catch {
    return false;
  }
};

const summarizeDocument = (agent: DrawnixAgent) => {
  const document = agent.getDocument();
  const maxElements = 80;
  return {
    viewport: document.viewport,
    theme: document.theme,
    selection: document.selection.ids,
    totalElements: document.elements.length,
    elements: document.elements.slice(0, maxElements).map((element) => ({
      id: element.id,
      type: element.type,
      shape: element.shape,
      points: element.points,
      text: getElementText(element),
    })),
    omittedElements: Math.max(0, document.elements.length - maxElements),
  };
};

const buildSystemPrompt = (agent: DrawnixAgent) => {
  return [
    '你是 Drawnix 画布助手，可以直接调用工具操作当前白板。',
    '工作方式：',
    '1. 不确定画布内容或元素 ID 时，先调用 get_document。',
    '2. 新增图形使用 add_elements。坐标是画布坐标，每个形状都必须有 x、y、width、height。',
    '3. 箭头使用 kind="arrow"，通过 from.elementId / to.elementId 绑定元素；也可以给坐标或 points。',
    '4. 修改已有元素使用 update_elements，删除使用 delete_elements。',
    '5. 只有拿到工具返回 ok=true 才能说操作已完成。',
    '6. 布局保持清晰：同层间距 80-160，主干流程从左到右或从上到下。',
    '7. 不要编造画布上不存在的内容；用户说“刚才的/选中的”时先读取当前文档。',
    '8. 操作完成后用简洁中文说明做了什么。',
    `当前画布摘要：${JSON.stringify(summarizeDocument(agent))}`,
  ].join('\n');
};

const callChatCompletions = async (
  settings: LlmSettings,
  messages: OpenAiMessage[],
  signal?: AbortSignal,
  includeTools = true
): Promise<OpenAiResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }
  const body: Record<string, unknown> = {
    model: settings.model.trim() || DEFAULT_LLM_SETTINGS.model,
    messages,
  };
  if (includeTools) {
    body.tools = TOOL_SCHEMA;
    body.tool_choice = 'auto';
  }
  const requestTarget = resolveRequestTarget(settings.baseUrl);
  const response = await fetch(requestTarget.url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body),
  });
  if (requestTarget.viaProxy && response.status === 404) {
    throw new Error('本地模型代理不可用，请通过 npm start 或 vite preview 打开页面。');
  }
  const text = await response.text();
  let data: OpenAiResponse;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`模型返回了非 JSON 内容（HTTP ${response.status}）：${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    const message = data.error?.message || text.slice(0, 300) || response.statusText;
    throw new Error(`模型请求失败（HTTP ${response.status}）：${message}`);
  }
  return data;
};

const assertSettingsUsable = (settings: LlmSettings) => {
  if (!settings.model.trim()) {
    throw new Error('请先填写模型名称。');
  }
  if (!settings.apiKey.trim() && isOpenAiEndpoint(settings.baseUrl)) {
    throw new Error('请先在设置里填写 OpenAI API Key，或切换到不需要鉴权的兼容接口。');
  }
};

export type LlmConnectionTestResult = {
  reply: string;
  latencyMs: number;
};

export const testLlmConnection = async (
  settings: LlmSettings,
  signal?: AbortSignal
): Promise<LlmConnectionTestResult> => {
  assertSettingsUsable(settings);
  const startedAt = Date.now();
  const data = await callChatCompletions(
    settings,
    [{ role: 'user', content: '请只回复 OK' }],
    signal,
    false
  );
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('接口已响应，但模型没有返回文本。');
  }
  return {
    reply: reply.slice(0, 120),
    latencyMs: Date.now() - startedAt,
  };
};

const toExecutionError = (message: string): DrawnixAgentOperationResult => ({
  ok: false,
  error: {
    name: 'DrawnixAgentError',
    message,
  },
});

export const executeToolCall = (
  agent: DrawnixAgent,
  toolCall: OpenAiToolCall
): DrawnixAgentOperationResult => {
  let args: Record<string, unknown>;
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    return toExecutionError('工具参数不是合法 JSON');
  }

  switch (toolCall.function.name) {
    case 'get_document':
      return agent.execute({ action: 'getDocument' });
    case 'add_elements':
      return agent.execute({
        action: 'addElements',
        payload: args.elements as DrawnixAgentElementInput[],
      });
    case 'update_elements':
      return agent.execute({
        action: 'updateElements',
        payload: args.updates as DrawnixAgentElementUpdate[],
      });
    case 'delete_elements':
      return agent.execute({
        action: 'deleteElements',
        payload: args.ids as string[],
      });
    case 'select_elements':
      return agent.execute({
        action: 'selectElements',
        payload: args.ids as string[],
      });
    case 'clear_canvas':
      return agent.execute({ action: 'clear' });
    case 'set_viewport':
      return agent.execute({
        action: 'setViewport',
        payload: {
          origination: Array.isArray(args.origination)
            ? (args.origination as [number, number])
            : undefined,
          zoom: typeof args.zoom === 'number' ? args.zoom : undefined,
        },
      });
    case 'fit_viewport':
      return agent.execute({ action: 'fitViewport' });
    case 'undo':
      return agent.execute({ action: 'undo' });
    case 'redo':
      return agent.execute({ action: 'redo' });
    default:
      return toExecutionError(`未知工具：${toolCall.function.name}`);
  }
};

export type RunChatTurnOptions = {
  agent: DrawnixAgent;
  settings: LlmSettings;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export type RunChatTurnResult = {
  text: string;
  toolNames: string[];
};

export const runChatTurn = async ({
  agent,
  settings,
  messages,
  signal,
}: RunChatTurnOptions): Promise<RunChatTurnResult> => {
  assertSettingsUsable(settings);

  const apiMessages: OpenAiMessage[] = [
    { role: 'system', content: buildSystemPrompt(agent) },
    ...messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-20)
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ];
  const toolNames: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callChatCompletions(settings, apiMessages, signal);
    const assistant = data.choices?.[0]?.message;
    if (!assistant) {
      throw new Error(data.error?.message || '模型没有返回消息');
    }

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        text: assistant.content?.trim() || (toolNames.length ? '已完成画布操作。' : ''),
        toolNames,
      };
    }

    apiMessages.push({
      role: 'assistant',
      content: assistant.content ?? null,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const result = executeToolCall(agent, toolCall);
      toolNames.push(TOOL_LABELS[toolCall.function.name] || toolCall.function.name);
      apiMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    text: '工具调用次数已达到上限，请继续描述下一步操作。',
    toolNames,
  };
};
