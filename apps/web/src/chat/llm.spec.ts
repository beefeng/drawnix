import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawnixAgent, DrawnixAgentOperationResult } from '@drawnix/drawnix';
import {
  executeToolCall,
  runChatTurn,
  testLlmConnection,
  type ChatMessage,
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
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '已画好开始节点。' } }],
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runChatTurn({
      agent,
      settings,
      messages: [userMessage],
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
