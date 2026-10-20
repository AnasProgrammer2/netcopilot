import Anthropic from '@anthropic-ai/sdk'

export type AiSource   = 'hosted' | 'byok'
export type AiProvider = 'anthropic' | 'openai'

export interface AiModelOption {
  id:    string
  label: string
}

export const AI_MODELS: Record<AiProvider, AiModelOption[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-1',   label: 'Claude Opus 4.1'   },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5'  },
  ],
  openai: [
    { id: 'gpt-4o',      label: 'GPT-4o'      },
    { id: 'gpt-4.1',     label: 'GPT-4.1'     },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
}

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai:    'gpt-4o',
}

export function credentialKeyForProvider(provider: AiProvider): string {
  return provider === 'openai' ? 'ai.openai' : 'ai.anthropic'
}

export function resolveModel(provider: AiProvider, stored?: string | null): string {
  const catalog = AI_MODELS[provider]
  if (stored && catalog.some((m) => m.id === stored)) return stored
  return DEFAULT_AI_MODEL[provider]
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

export interface ToolCall {
  id:    string
  name:  string
  input: unknown
}

export interface ProviderTurnResult {
  toolCalls:        ToolCall[]
  assistantContent: unknown[]
  inputTokens:      number
  outputTokens:     number
  stopReason:       string
  textCollected:    string
}

interface AnthropicMessage {
  role:    'user' | 'assistant'
  content: unknown
}

interface ContentBlock {
  type?:        string
  text?:        string
  id?:          string
  name?:        string
  input?:       unknown
  tool_use_id?: string
  content?:     unknown
}

const TOOLS_ANTHROPIC_TO_OPENAI = (tools: unknown[]) =>
  (tools as Array<{ name: string; description: string; input_schema: unknown }>).map((t) => ({
    type: 'function' as const,
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.input_schema,
    },
  }))

function toOpenAIMessages(system: string, messages: AnthropicMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ role: 'system', content: system }]

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content })
      continue
    }
    if (!Array.isArray(msg.content)) continue
    const blocks = msg.content as ContentBlock[]

    const toolResults = blocks.filter((b) => b.type === 'tool_result')
    if (toolResults.length) {
      for (const tr of toolResults) {
        const content = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? '')
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content })
      }
      continue
    }

    const texts    = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    const toolUses = blocks.filter((b) => b.type === 'tool_use')

    if (msg.role === 'assistant' && toolUses.length) {
      out.push({
        role:    'assistant',
        content: texts || null,
        tool_calls: toolUses.map((t) => ({
          id:   t.id,
          type: 'function',
          function: {
            name:      t.name,
            arguments: JSON.stringify(t.input ?? {}),
          },
        })),
      })
      continue
    }

    out.push({ role: msg.role, content: texts })
  }

  return out
}

function friendlyProviderError(err: unknown, provider: AiProvider): string {
  if (err instanceof Error && err.name === 'AbortError') return 'Cancelled'
  const raw = err instanceof Error ? err.message : String(err)
  if (/401|invalid.?api.?key|incorrect api key/i.test(raw)) {
    return provider === 'openai'
      ? 'OpenAI rejected this API key. Check it in Settings → ARIA.'
      : 'Anthropic rejected this API key. Check it in Settings → ARIA.'
  }
  if (/429|rate.?limit/i.test(raw)) return 'Provider rate limit reached. Wait a moment and try again.'
  if (/404|not_found|model/i.test(raw) && /model/i.test(raw)) {
    return 'That model is not available for this key. Pick another model in Settings → ARIA.'
  }
  return raw || 'Provider request failed.'
}

export async function callAnthropicTurn(
  apiKey:       string,
  model:        string,
  systemPrompt: string,
  messages:     AnthropicMessage[],
  tools:        unknown[],
  maxTokens:    number,
  onChunk:      (text: string) => void,
  signal?:      AbortSignal,
): Promise<ProviderTurnResult> {
  const client = new Anthropic({ apiKey })
  const runner = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system:     systemPrompt,
    tools:      (tools as Anthropic.Tool[]) ?? [],
    messages:   messages as Anthropic.MessageParam[],
  }, { signal })

  runner.on('text', (text) => {
    if (!signal?.aborted) onChunk(text)
  })

  const finalMsg = await runner.finalMessage()

  const toolCalls: ToolCall[] = []
  const contentBlocks: unknown[] = []
  let textCollected = ''

  for (const block of finalMsg.content) {
    if (block.type === 'text') {
      contentBlocks.push({ type: 'text', text: block.text })
      textCollected += block.text
    } else if (block.type === 'tool_use') {
      const tc: ToolCall = { id: block.id, name: block.name, input: block.input }
      toolCalls.push(tc)
      contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }
  }

  return {
    toolCalls,
    assistantContent: contentBlocks,
    inputTokens:      finalMsg.usage.input_tokens,
    outputTokens:     finalMsg.usage.output_tokens,
    stopReason:       finalMsg.stop_reason ?? 'end_turn',
    textCollected,
  }
}

async function* parseOpenAISSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue
          try { yield JSON.parse(data) as Record<string, unknown> } catch { /* ignore malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function callOpenAITurn(
  apiKey:       string,
  model:        string,
  systemPrompt: string,
  messages:     AnthropicMessage[],
  tools:        unknown[],
  maxTokens:    number,
  onChunk:      (text: string) => void,
  signal?:      AbortSignal,
): Promise<ProviderTurnResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens:      maxTokens,
      stream:          true,
      stream_options:  { include_usage: true },
      tools:           TOOLS_ANTHROPIC_TO_OPENAI(tools),
      messages:        toOpenAIMessages(systemPrompt, messages),
    }),
    signal,
  })

  if (!response.ok || !response.body) {
    let reason = `HTTP ${response.status}`
    try {
      const err = await response.clone().json() as { error?: { message?: string } }
      if (err.error?.message) reason = err.error.message
    } catch { /* ignore */ }
    throw new Error(friendlyProviderError(new Error(reason), 'openai'))
  }

  const toolAcc: Record<number, { id: string; name: string; args: string }> = {}
  let textCollected = ''
  let inputTokens   = 0
  let outputTokens  = 0
  let stopReason    = 'end_turn'

  for await (const parsed of parseOpenAISSE(response.body)) {
    if (signal?.aborted) break

    const usage = parsed.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (usage) {
      inputTokens  = usage.prompt_tokens ?? inputTokens
      outputTokens = usage.completion_tokens ?? outputTokens
    }

    const choices = parsed.choices as Array<{
      finish_reason?: string | null
      delta?: {
        content?: string | null
        tool_calls?: Array<{
          index: number
          id?: string
          function?: { name?: string; arguments?: string }
        }>
      }
    }> | undefined

    const choice = choices?.[0]
    if (!choice) continue
    if (choice.finish_reason) {
      stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason
    }

    const delta = choice.delta
    if (delta?.content) {
      textCollected += delta.content
      onChunk(delta.content)
    }

    for (const tc of delta?.tool_calls ?? []) {
      if (!toolAcc[tc.index]) toolAcc[tc.index] = { id: '', name: '', args: '' }
      if (tc.id) toolAcc[tc.index].id = tc.id
      if (tc.function?.name) toolAcc[tc.index].name += tc.function.name
      if (tc.function?.arguments) toolAcc[tc.index].args += tc.function.arguments
    }
  }

  const toolCalls: ToolCall[] = []
  const contentBlocks: unknown[] = []

  if (textCollected) {
    contentBlocks.push({ type: 'text', text: textCollected })
  }

  for (const acc of Object.values(toolAcc)) {
    let input: unknown = {}
    try { input = acc.args ? JSON.parse(acc.args) : {} } catch { input = { raw: acc.args } }
    const tc: ToolCall = { id: acc.id || `call_${acc.name}`, name: acc.name, input }
    toolCalls.push(tc)
    contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
  }

  return {
    toolCalls,
    assistantContent: contentBlocks,
    inputTokens,
    outputTokens,
    stopReason,
    textCollected,
  }
}

export async function callLocalTurn(
  provider:     AiProvider,
  apiKey:       string,
  model:        string,
  systemPrompt: string,
  messages:     AnthropicMessage[],
  tools:        unknown[],
  maxTokens:    number,
  onChunk:      (text: string) => void,
  signal?:      AbortSignal,
): Promise<ProviderTurnResult> {
  try {
    if (provider === 'openai') {
      return await callOpenAITurn(apiKey, model, systemPrompt, messages, tools, maxTokens, onChunk, signal)
    }
    return await callAnthropicTurn(apiKey, model, systemPrompt, messages, tools, maxTokens, onChunk, signal)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new Error(friendlyProviderError(err, provider))
  }
}

export async function testProviderConnection(
  provider: AiProvider,
  apiKey:   string,
  model:    string,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages:   [{ role: 'user', content: 'ping' }],
        }),
      })
      if (!res.ok) {
        let reason = `HTTP ${res.status}`
        try {
          const err = await res.json() as { error?: { message?: string } }
          if (err.error?.message) reason = err.error.message
        } catch { /* ignore */ }
        return { ok: false, message: friendlyProviderError(new Error(reason), 'openai') }
      }
      return { ok: true, message: 'OpenAI key is valid.' }
    }

    const client = new Anthropic({ apiKey })
    await client.messages.create({
      model,
      max_tokens: 8,
      messages:   [{ role: 'user', content: 'ping' }],
    })
    return { ok: true, message: 'Anthropic key is valid.' }
  } catch (err) {
    return { ok: false, message: friendlyProviderError(err, provider) }
  }
}
