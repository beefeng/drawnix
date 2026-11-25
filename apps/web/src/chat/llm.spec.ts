import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawnixAgent, DrawnixAgentOperationResult } from '@drawnix/drawnix';
import {
  executeToolCall,
  runChatTurn,
  testLlmConnection,
  type ChatMessage,
  type ChatTurnEvent,
  type LlmSettings,
} from './llm';

const createAgentMock = () => {
  const execute = vi.fn((): DrawnixAgentOperationResult => ({ ok: true, result: null }));
  const agent = {
    execute,
    getDocument: vi.fn(() => ({
      elements: [],
      viewport: { zoom: 1, origination: [0, 0] },
      theme: 'default',
      selection: { ids: [], rectangle: null },
    })),
  } as unknown as DrawnixAgent;
  return { agent, execute };
};

const settings: LlmSettings = {
  baseUrl: 'http://127.0.0.1:9999/v1',
  apiKey: '',
  model: 'test-model',
};

const userMessage: ChatMessage = {
  id: 'm1',
  role: 'user',
  content: '画一个登录流程',
  createdAt: 1,
};

const sseResponse = (payloads: Array<Record<string, unknown> | string>) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      payloads.forEach((payload) => {
        const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
};

describe('chat llm tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a tool call to the canvas agent operation', () => {
    const { agent, execute } = createAgentMock();

    executeToolCall(agent, {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'add_elements',
        arguments: JSON.stringify({
          elements: [{ id: 'a', shape: 'rectangle', x: 0, y: 0, width: 100, height: 50 }],
        }),
      },
    });

    expect(execute).toHaveBeenCalledWith({
      action: 'addElements',
      payload: [
        {
          id: 'a',
          shape: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
      ],
    });
  });

  it('executes tool calls and continues until the model returns text', async () => {
    const { agent, execute } = createAgentMock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-1',
                      type: 'function',
                      function: {
                        name: 'add_elements',
                        arguments: JSON.stringify({
                          elements: [
                            {
                              id: 'start',
                              shape: 'rectangle',
                              x: 0,
                              y: 0,
                              width: 160,
                              height: 70,
                              text: '开始',
                            },
                          ],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '已画好开始节点。' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    execute.mockReturnValue({ ok: true, result: [{ id: 'start' }] });
    const events: ChatTurnEvent[] = [];
    const result = await runChatTurn({
      agent,
      settings,
      messages: [userMessage],
      onEvent: (event) => events.push(event),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      text: '已画好开始节点。',
      toolNames: ['新增元素'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondRequest.messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-1',
    });
    expect(events.map((event) => event.type)).toEqual([
      'round_start',
      'tool_start',
      'tool_end',
      'round_start',
    ]);
    expect(events[0]).toMatchObject({ type: 'round_start', round: 0 });
    expect(events[1]).toMatchObject({
      type: 'tool_start',
      toolCallId: 'call-1',
      label: '新增元素',
    });
    expect(events[2]).toMatchObject({
      type: 'tool_end',
      toolCallId: 'call-1',
      label: '新增元素',
      ok: true,
      detail: '新增 1 个元素',
    });
    expect(
      (events[2] as Extract<ChatTurnEvent, { type: 'tool_end' }>).durationMs
    ).toBeGreaterThanOrEqual(0);
  });

  it('reports failed tool results to the timeline', async () => {
    const { agent, execute } = createAgentMock();
    execute.mockReturnValue({
      ok: false,
      error: { name: 'DrawnixAgentError', message: 'Element not found: missing' },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: 'call-2',
                        type: 'function',
                        function: {
                          name: 'select_elements',
                          arguments: JSON.stringify({ ids: ['missing'] }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ choices: [{ message: { content: '没有找到元素。' } }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
    );
    const events: ChatTurnEvent[] = [];

    await runChatTurn({
      agent,
      settings,
      messages: [userMessage],
      onEvent: (event) => events.push(event),
    });

    expect(events[2]).toMatchObject({
      type: 'tool_end',
      ok: false,
      detail: 'Element not found: missing',
    });
  });

  it('streams text deltas and assembles split tool arguments', async () => {
    const { agent, execute } = createAgentMock();
    execute.mockReturnValue({ ok: true, result: [{ id: 'start' }] });
    const argumentsText = JSON.stringify({
      elements: [{ id: 'start', shape: 'rectangle', x: 0, y: 0, width: 160, height: 70 }],
    });
    const splitAt = 24;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-1',
                      type: 'function',
                      function: {
                        name: 'add_elements',
                        arguments: argumentsText.slice(0, splitAt),
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(splitAt) } }],
                },
              },
            ],
          },
          '[DONE]',
        ])
      )
      .mockResolvedValueOnce(
        sseResponse([
          { choices: [{ delta: { reasoning_content: '想一想。' } }] },
          { choices: [{ delta: { content: '已画好' } }] },
          { choices: [{ delta: { content: '开始节点。' } }] },
          '[DONE]',
        ])
      );
    vi.stubGlobal('fetch', fetchMock);
    const events: ChatTurnEvent[] = [];

    const result = await runChatTurn({
      agent,
      settings,
      messages: [userMessage],
      onEvent: (event) => events.push(event),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ stream: true });
    expect(execute).toHaveBeenCalledWith({
      action: 'addElements',
      payload: [{ id: 'start', shape: 'rectangle', x: 0, y: 0, width: 160, height: 70 }],
    });
    expect(result.text).toBe('已画好开始节点。');
    expect(
      events
        .filter((event) => event.type === 'text_delta')
        .map((event) => (event as Extract<ChatTurnEvent, { type: 'text_delta' }>).delta)
    ).toEqual(['已画好', '开始节点。']);
    expect(
      events
        .filter((event) => event.type === 'reasoning_delta')
        .map((event) => (event as Extract<ChatTurnEvent, { type: 'reasoning_delta' }>).delta)
    ).toEqual(['想一想。']);
    expect(events.find((event) => event.type === 'tool_end')).toMatchObject({
      type: 'tool_end',
      ok: true,
      detail: '新增 1 个元素',
      elementIds: ['start'],
    });
  });

  it('retries once when the request fails at the network layer', async () => {
    const { agent } = createAgentMock();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '重试成功' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runChatTurn({
      agent,
      settings,
      messages: [userMessage],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('重试成功');
  });

  it('requires an API key for the OpenAI endpoint', async () => {
    const { agent } = createAgentMock();

    await expect(
      runChatTurn({
        agent,
        settings: {
          ...settings,
          baseUrl: 'https://api.openai.com/v1',
        },
        messages: [userMessage],
      })
    ).rejects.toThrow('API Key');
  });

  it('tests the configured endpoint without sending tool definitions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK' } }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await testLlmConnection(settings);

    expect(result.reply).toBe('OK');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/__drawnix_llm_proxy?url=');
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(requestBody.model).toBe('test-model');
    expect(requestBody.tools).toBeUndefined();
  });

  it('calls a loopback endpoint directly from a public page', async () => {
    vi.stubGlobal('window', { location: new URL('https://drawnix.halosky.top/') });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK' } }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await testLlmConnection(settings);

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:9999/v1/chat/completions');
  });

  it('returns a tool error without throwing when arguments are invalid', () => {
    const { agent, execute } = createAgentMock();

    const result = executeToolCall(agent, {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'add_elements',
        arguments: '{broken',
      },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
