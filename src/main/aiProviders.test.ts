import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callLocalTurn,
  credentialKeyForProvider,
  isLoopbackUrl,
  normalizeBaseUrl,
  normalizeProvider,
  resolveModel,
  testProviderConnection,
  type ProviderConfig,
} from './aiProviders'

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), { status })
}

const TOOLS = [{ name: 'run_command', description: 'Run', input_schema: { type: 'object', properties: {} } }]

const ollama: ProviderConfig = {
  provider: 'custom',
  apiKey:   null,
  model:    'qwen2.5:14b',
  baseUrl:  'http://localhost:11434/v1',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeBaseUrl', () => {
  it('appends /v1 to a bare host', () => {
    expect(normalizeBaseUrl('http://localhost:11434')).toEqual({ ok: true, url: 'http://localhost:11434/v1' })
  })

  it('keeps an explicit path and strips trailing slashes, query and hash', () => {
    expect(normalizeBaseUrl(' http://10.0.0.5:1234/v1/?x=1#y ')).toEqual({ ok: true, url: 'http://10.0.0.5:1234/v1' })
    expect(normalizeBaseUrl('https://gw.example.com/openai/v1/')).toEqual({ ok: true, url: 'https://gw.example.com/openai/v1' })
  })

  it('rejects non-http schemes, credentials in the URL and garbage', () => {
    expect(normalizeBaseUrl('file:///etc/passwd').ok).toBe(false)
    expect(normalizeBaseUrl('http://user:pass@localhost:11434').ok).toBe(false)
    expect(normalizeBaseUrl('localhost:11434').ok).toBe(false)
    expect(normalizeBaseUrl('').ok).toBe(false)
  })
})

describe('provider helpers', () => {
  it('falls back to anthropic for unknown providers', () => {
    expect(normalizeProvider('xai')).toBe('xai')
    expect(normalizeProvider('custom')).toBe('custom')
    expect(normalizeProvider('evil')).toBe('anthropic')
    expect(normalizeProvider(undefined)).toBe('anthropic')
  })

  it('keeps distinct credential slots per provider', () => {
    expect(new Set(['anthropic', 'openai', 'xai', 'custom'].map((p) => credentialKeyForProvider(p as never))).size).toBe(4)
  })

  it('accepts free-form model IDs but replaces retired or malformed ones', () => {
    expect(resolveModel('custom', 'hf.co/bartowski/Qwen2.5:Q4_K_M')).toBe('hf.co/bartowski/Qwen2.5:Q4_K_M')
    expect(resolveModel('xai', 'grok-4')).toBe('grok-4')
    expect(resolveModel('anthropic', 'claude-opus-4-1')).toBe('claude-opus-5-5')
    expect(resolveModel('openai', 'gpt 4; rm -rf')).toBe('gpt-4.1')
    expect(resolveModel('custom', '')).toBe('')
  })

  it('detects loopback endpoints', () => {
    expect(isLoopbackUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLoopbackUrl('http://127.0.0.1:1234/v1')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:1234/v1')).toBe(true)
    expect(isLoopbackUrl('http://192.168.1.20:11434/v1')).toBe(false)
  })
})

describe('OpenAI-compatible turns', () => {
  it('streams text and assembles index-keyed tool calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { choices: [{ delta: { content: 'Checking ' } }] },
      { choices: [{ delta: { content: 'BGP' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'run_command', arguments: '{"comm' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'and":"show bgp summary"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    const result = await callLocalTurn(
      { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1' },
      'system', [{ role: 'user', content: 'hi' }], TOOLS, 8192, (t) => chunks.push(t),
    )

    expect(chunks.join('')).toBe('Checking BGP')
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'run_command', input: { command: 'show bgp summary' } }])
    expect(result.stopReason).toBe('tool_use')
    expect(result.inputTokens).toBe(120)
    expect(result.outputTokens).toBe(30)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.max_completion_tokens).toBe(8192)
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.tools[0].function.name).toBe('run_command')
  })

  it('handles Ollama-style tool calls without index and with object arguments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { choices: [{ delta: { tool_calls: [
        { id: 'a', function: { name: 'run_command', arguments: { command: 'show ip route' } } },
        { id: 'b', function: { name: 'run_command', arguments: '{"command":"show version"}' } },
      ] }, finish_reason: 'tool_calls' }] },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callLocalTurn(ollama, 's', [{ role: 'user', content: 'x' }], TOOLS, 4096, () => {})

    expect(result.toolCalls.map((t) => t.input)).toEqual([{ command: 'show ip route' }, { command: 'show version' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(init.headers.Authorization).toBeUndefined()
    const body = JSON.parse(init.body)
    expect(body.max_tokens).toBe(4096)
    expect(body.stream_options).toBeUndefined()
  })

  it('retries with the other output-cap field when the server rejects it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonError(400, "Unsupported parameter: 'max_completion_tokens'"))
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callLocalTurn(
      { provider: 'xai', apiKey: 'xai-k', model: 'grok-4' },
      's', [{ role: 'user', content: 'x' }], TOOLS, 8192, () => {},
    )

    expect(result.textCollected).toBe('ok')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.x.ai/v1/chat/completions')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_tokens).toBe(8192)
  })

  it('drops tools and tells the user when a local model cannot call tools', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonError(400, 'registry.ollama.ai/library/gemma:2b does not support tools'))
      .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'Here is how' }, finish_reason: 'stop' }] }]))
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    const result = await callLocalTurn(ollama, 's', [{ role: 'user', content: 'x' }], TOOLS, 4096, (t) => chunks.push(t))

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toBeUndefined()
    expect(chunks[0]).toMatch(/does not support tool calling/)
    expect(result.textCollected).toMatch(/Here is how$/)
    expect(result.toolCalls).toEqual([])
  })

  it('maps HTTP failures to actionable messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError(401, 'Incorrect API key provided')))
    await expect(callLocalTurn({ provider: 'openai', apiKey: 'bad', model: 'gpt-4.1' }, 's', [], TOOLS, 10, () => {}))
      .rejects.toThrow(/rejected the API key/)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonError(400, "This model's maximum context length is 128000 tokens.")))
    await expect(callLocalTurn({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' }, 's', [], TOOLS, 10, () => {}))
      .rejects.toThrow(/context window/)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(callLocalTurn(ollama, 's', [], TOOLS, 10, () => {}))
      .rejects.toThrow(/Could not reach localhost:11434/)
  })

  it('converts tool results and assistant tool calls to OpenAI messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }]))
    vi.stubGlobal('fetch', fetchMock)

    await callLocalTurn(ollama, 'sys', [
      { role: 'user', content: 'check' },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'Running' },
        { type: 'tool_use', id: 't1', name: 'run_command', input: { command: 'show clock' } },
      ] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '12:00' }] },
    ], TOOLS, 10, () => {})

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'check' },
      { role: 'assistant', content: 'Running', tool_calls: [
        { id: 't1', type: 'function', function: { name: 'run_command', arguments: '{"command":"show clock"}' } },
      ] },
      { role: 'tool', tool_call_id: 't1', content: '12:00' },
    ])
  })
})

describe('testProviderConnection', () => {
  it('lists models on a custom endpoint and checks the selected one', async () => {
    const models = () => new Response(JSON.stringify({ data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5:14b' }] }))
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => models()))

    await expect(testProviderConnection(ollama)).resolves.toEqual({ ok: true, message: 'Connected to localhost:11434 · qwen2.5:14b' })
    await expect(testProviderConnection({ ...ollama, model: 'mistral' })).resolves.toMatchObject({ ok: false })
    await expect(testProviderConnection({ ...ollama, model: '' })).resolves.toMatchObject({ ok: true })
  })
})

describe('Anthropic turns', () => {
  function anthropicSse(events: Array<Record<string, unknown>>): Response {
    const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  it('caches the prefix, opts into fallbacks and echoes thinking blocks back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicSse([
      { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 90 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Checking' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'run_command', input: {} } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":"show ver"}' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } },
      { type: 'message_stop' },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const chunks: string[] = []
    const result = await callLocalTurn(
      { provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5-5' },
      'sys', [{ role: 'user', content: 'hi' }], TOOLS, 16_000, (t) => chunks.push(t),
    )

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.cache_control).toEqual({ type: 'ephemeral' })
    expect(body.fallbacks).toBe('default')
    expect(new Headers(init.headers).get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')

    expect(chunks.join('')).toBe('Checking')
    expect(result.toolCalls).toEqual([{ id: 'toolu_1', name: 'run_command', input: { command: 'show ver' } }])
    expect((result.assistantContent as Array<{ type: string }>).map((b) => b.type)).toEqual(['thinking', 'text', 'tool_use'])
    expect(result.inputTokens).toBe(100)
  })

  it('does not send fallbacks to models that do not support them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicSse([
      { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await callLocalTurn({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-4-5' }, 's', [{ role: 'user', content: 'x' }], TOOLS, 100, () => {})
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.fallbacks).toBeUndefined()
  })

  it('maps an invalid key to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )))
    await expect(callLocalTurn({ provider: 'anthropic', apiKey: 'bad', model: 'claude-opus-5-5' }, 's', [{ role: 'user', content: 'x' }], TOOLS, 100, () => {}))
      .rejects.toThrow(/Claude rejected the API key/)
  })
})
