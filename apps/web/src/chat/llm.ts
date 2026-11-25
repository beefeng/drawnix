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
  steps?: ChatStep[];
};

export type ChatStep = {
  id: string;
  label: string;
  status: 'running' | 'success' | 'error';
  detail?: string;
  durationMs?: number;
};

export type ChatTurnEvent =
  | { type: 'round_start'; round: number }
  | { type: 'text_delta'; delta: string }
  | { type: 'reasoning_delta'; delta: string }
  | {
      type: 'tool_start';
      toolCallId: string;
      toolName: string;
      label: string;
    }
  | {
      type: 'tool_end';
      toolCallId: string;
      toolName: string;
      label: string;
      ok: boolean;
      detail: string;
      durationMs: number;
      elementIds?: string[];
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

type OpenAiToolCallDelta = {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAiStreamChunk = {
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAiToolCallDelta[];
    };
  }>;
  error?: {
    message?: string;
  };
};

const PRODUCTION_LLM_SETTINGS: LlmSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
};

// 仅本地 dev 生效；生产构建不会加载 .env.development.local，且 DEV 会被静态替换为 false。
const DEV_LLM_SETTINGS: LlmSettings = {
  baseUrl: import.meta.env.VITE_DEV_LLM_BASE_URL || '',
  apiKey: import.meta.env.VITE_DEV_LLM_API_KEY || '',
  model: import.meta.env.VITE_DEV_LLM_MODEL || '',
};

export const DEFAULT_LLM_SETTINGS: LlmSettings =
  import.meta.env.DEV && DEV_LLM_SETTINGS.baseUrl ? DEV_LLM_SETTINGS : PRODUCTION_LLM_SETTINGS;

const LLM_SETTINGS_KEY = 'drawnix_chat_llm_settings';
const CHAT_MESSAGES_KEY = 'drawnix_chat_messages';
const MAX_TOOL_ROUNDS = 20;
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
    const parsed = JSON.parse(stored) as Partial<LlmSettings>;
    // dev 下旧的空 Key 配置不应覆盖本地默认模型。
    if (import.meta.env.DEV && !parsed.apiKey?.trim()) {
      return { ...DEFAULT_LLM_SETTINGS };
    }
    return { ...DEFAULT_LLM_SETTINGS, ...parsed };
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
  const persistable = messages.filter(
    (message) => message.role === 'user' || message.content.trim().length > 0
  );
  localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(persistable.slice(-80)));
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
    // 同源代理只存在于 vite dev / preview；线上页面必须直连 loopback 服务。
    const pageIsLoopback = isLoopbackHost(window.location.hostname);
    if (
      pageIsLoopback &&
      isLoopbackHost(target.hostname) &&
      target.origin !== window.location.origin
    ) {
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

const readStreamingCompletion = async (
  response: Response,
  handlers: {
    onTextDelta?: (delta: string) => void;
    onReasoningDelta?: (delta: string) => void;
  } = {}
): Promise<OpenAiResponse> => {
  const { onTextDelta, onReasoningDelta } = handlers;
  const contentType = response.headers.get('content-type') || '';
  if (!response.body || contentType.includes('application/json')) {
    const text = await response.text();
    return text ? (JSON.parse(text) as OpenAiResponse) : {};
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, OpenAiToolCall>();
  let content = '';
  let model: string | undefined;
  let buffer = '';

  const handlePayload = (payload: string) => {
    if (!payload || payload === '[DONE]') {
      return;
    }
    let chunk: OpenAiStreamChunk;
    try {
      chunk = JSON.parse(payload) as OpenAiStreamChunk;
    } catch {
      return;
    }
    if (chunk.error?.message) {
      throw new Error(chunk.error.message);
    }
    if (chunk.model) {
      model = chunk.model;
    }
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) {
      return;
    }
    if (delta.content) {
      content += delta.content;
      onTextDelta?.(delta.content);
    }
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (reasoning) {
      onReasoningDelta?.(reasoning);
    }
    delta.tool_calls?.forEach((toolCall, position) => {
      const index = typeof toolCall.index === 'number' ? toolCall.index : position;
      const current = toolCalls.get(index) ?? {
        id: '',
        type: 'function' as const,
        function: { name: '', arguments: '' },
      };
      if (toolCall.id) {
        current.id = toolCall.id;
      }
      if (toolCall.function?.name) {
        current.function.name = toolCall.function.name;
      }
      if (toolCall.function?.arguments) {
        current.function.arguments += toolCall.function.arguments;
      }
      toolCalls.set(index, current);
    });
  };

  const handleBlock = (block: string) => {
    const payload = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    handlePayload(payload);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        handleBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) {
      handleBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  const assembledToolCalls = [...toolCalls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, toolCall]) => toolCall);

  return {
    model,
    choices: [
      {
        message: {
          content: content || null,
          tool_calls: assembledToolCalls.length > 0 ? assembledToolCalls : undefined,
        },
      },
    ],
  };
};

type ChatCompletionOptions = {
  includeTools?: boolean;
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
};

const RETRYABLE_STATUS = new Set([502, 503, 504]);

const waitForRetry = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const requestWithRetry = async (
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, init);
      if (RETRYABLE_STATUS.has(response.status) && attempt === 0) {
        void response.body?.cancel().catch(() => {});
        await waitForRetry(400);
        continue;
      }
      return response;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      lastError = error;
      if (attempt === 0) {
        await waitForRetry(400);
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('模型请求失败');
};

const callChatCompletions = async (
  settings: LlmSettings,
  messages: OpenAiMessage[],
  options: ChatCompletionOptions = {},
  signal?: AbortSignal
): Promise<OpenAiResponse> => {
  const { includeTools = true, stream = false, onTextDelta, onReasoningDelta } = options;
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
  if (stream) {
    body.stream = true;
  }
  const requestTarget = resolveRequestTarget(settings.baseUrl);
  const response = await requestWithRetry(
    requestTarget.url,
    {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify(body),
    },
    signal
  );
  if (requestTarget.viaProxy && (response.status === 404 || response.status === 405)) {
    throw new Error('本地模型代理不可用，请通过 npm start 或 vite preview 打开页面。');
  }
  if (!response.ok) {
    const text = await response.text();
    let data: OpenAiResponse = {};
    try {
      data = text ? (JSON.parse(text) as OpenAiResponse) : {};
    } catch {
      // Keep the raw body as the error message below.
    }
    const message = data.error?.message || text.slice(0, 300) || response.statusText;
    throw new Error(`模型请求失败（HTTP ${response.status}）：${message}`);
  }
  if (stream) {
    return readStreamingCompletion(response, { onTextDelta, onReasoningDelta });
  }
  const text = await response.text();
  let data: OpenAiResponse;
  try {
    data = text ? (JSON.parse(text) as OpenAiResponse) : {};
  } catch {
    throw new Error(`模型返回了非 JSON 内容（HTTP ${response.status}）：${text.slice(0, 300)}`);
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
    { includeTools: false },
    signal
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

const getArrayLength = (value: unknown): number | null => {
  return Array.isArray(value) ? value.length : null;
};

const getElementIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((element) => (element as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
};

const describeToolResult = (toolName: string, result: DrawnixAgentOperationResult): string => {
  if (!result.ok) {
    return result.error.message || '执行失败';
  }
  const data = result.result;
  switch (toolName) {
    case 'get_document': {
      const count = getArrayLength((data as { elements?: unknown } | null)?.elements);
      return count === null ? '已读取画布' : `读取到 ${count} 个元素`;
    }
    case 'add_elements': {
      const count = getArrayLength(data);
      return count === null ? '已新增元素' : `新增 ${count} 个元素`;
    }
    case 'update_elements': {
      const count = getArrayLength(data);
      return count === null ? '已更新元素' : `更新 ${count} 个元素`;
    }
    case 'delete_elements': {
      const count = getArrayLength(data);
      return count === null ? '已删除元素' : `删除 ${count} 个元素`;
    }
    case 'select_elements': {
      const count = getArrayLength((data as { ids?: unknown } | null)?.ids);
      return count === null ? '已选中元素' : `选中 ${count} 个元素`;
    }
    case 'clear_canvas':
      return '已清空画布';
    case 'set_viewport':
      return '已调整视口';
    case 'fit_viewport':
      return '已适应画布';
    case 'undo':
      return '已撤销上一步';
    case 'redo':
      return '已重做';
    default:
      return '已完成';
  }
};

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
  onEvent?: (event: ChatTurnEvent) => void;
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
  onEvent,
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
    onEvent?.({ type: 'round_start', round });
    const data = await callChatCompletions(
      settings,
      apiMessages,
      {
        stream: true,
        onTextDelta: (delta) => onEvent?.({ type: 'text_delta', delta }),
        onReasoningDelta: (delta) => onEvent?.({ type: 'reasoning_delta', delta }),
      },
      signal
    );
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

    for (const [index, toolCall] of toolCalls.entries()) {
      const toolCallId = toolCall.id || `${round}-${index}`;
      const toolName = toolCall.function.name;
      const label = TOOL_LABELS[toolName] || toolName;
      onEvent?.({ type: 'tool_start', toolCallId, toolName, label });
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const result = executeToolCall(agent, toolCall);
      const durationMs = Math.max(
        0,
        Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
        )
      );
      onEvent?.({
        type: 'tool_end',
        toolCallId,
        toolName,
        label,
        ok: result.ok,
        detail: describeToolResult(toolName, result),
        durationMs,
        elementIds:
          result.ok && (toolName === 'add_elements' || toolName === 'update_elements')
            ? getElementIds(result.result)
            : undefined,
      });
      toolNames.push(label);
      apiMessages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        name: toolName,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    text: '工具调用次数已达到上限，请继续描述下一步操作。',
    toolNames,
  };
};
