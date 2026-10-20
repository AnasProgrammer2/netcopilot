import Anthropic from '@anthropic-ai/sdk'

export type AiSource   = 'hosted' | 'byok'
export type AiProvider = 'anthropic' | 'openai' | 'xai' | 'custom'

export const AI_PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'xai', 'custom']

export interface AiModelOption {
  id:    string
  label: string
}

interface ProviderMeta {
  label:       string
  /** OpenAI-compatible base URL (…/v1). Custom providers supply their own. */
  baseUrl?:    string
  keyRequired: boolean
  /** Name of the output-cap field on /chat/completions. */
  tokenParam:  'max_tokens' | 'max_completion_tokens'
  /** Ask for a final usage chunk (`stream_options.include_usage`). */
  streamUsage: boolean
}

export const PROVIDER_META: Record<AiProvider, ProviderMeta> = {
  anthropic: { label: 'Claude', keyRequired: true,  tokenParam: 'max_tokens',            streamUsage: false },
  openai:    { label: 'OpenAI', keyRequired: true,  tokenParam: 'max_completion_tokens', streamUsage: true, baseUrl: 'https://api.openai.com/v1' },
  xai:       { label: 'Grok',   keyRequired: true,  tokenParam: 'max_completion_tokens', streamUsage: true, baseUrl: 'https://api.x.ai/v1' },
  custom:    { label: 'Custom', keyRequired: false, tokenParam: 'max_tokens',            streamUsage: false },
}

// Suggestions only — every provider also accepts a typed model ID, and
// custom endpoints (Ollama, LM Studio) list their models via /v1/models.
export const AI_MODELS: Record<AiProvider, AiModelOption[]> = {
  anthropic: [
    { id: 'claude-opus-5-5',   label: 'Claude Opus 5.5'   },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5'  },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  ],
  openai: [
    { id: 'gpt-4.1',      label: 'GPT-4.1'      },
    { id: 'gpt-5',        label: 'GPT-5'        },
    { id: 'gpt-5-mini',   label: 'GPT-5 mini'   },
    { id: 'gpt-4o',       label: 'GPT-4o'       },
  ],
  xai: [
    { id: 'grok-4',      label: 'Grok 4'      },
    { id: 'grok-3-mini', label: 'Grok 3 mini' },
  ],
  custom: [],
}

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5-5',
  openai:    'gpt-4.1',
  xai:       'grok-4',
  custom:    '',
}

// Models that no longer serve requests; a stored selection falls back to the default.
const RETIRED_MODELS = new Set(['claude-opus-4-1', 'claude-opus-4-1-20250805'])

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_CAPABLE = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])

const MODEL_ID_RE = /^[\w.:/@+-]{1,200}$/

export function normalizeProvider(provider: unknown): AiProvider {
  return AI_PROVIDERS.includes(provider as AiProvider) ? provider as AiProvider : 'anthropic'
}

export function credentialKeyForProvider(provider: AiProvider): string {
  return `ai.${provider}`
}

export function resolveModel(provider: AiProvider, stored?: string | null): string {
  const id = stored?.trim()
  if (id && MODEL_ID_RE.test(id) && !RETIRED_MODELS.has(id)) return id
  return DEFAULT_AI_MODEL[provider]
}

/**
 * Validates a user-supplied OpenAI-compatible endpoint and returns it without
 * a trailing slash. A bare host (http://localhost:11434) gets `/v1` appended,
 * which is where Ollama and LM Studio serve the OpenAI API.
 */
export function normalizeBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { ok: false, error: 'Enter a full URL, e.g. http://localhost:11434/v1' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// endpoints are supported.' }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Put credentials in the API key field, not in the URL.' }
  }
  parsed.search = ''
  parsed.hash   = ''
  let path = parsed.pathname.replace(/\/+$/, '')
  if (!path) path = '/v1'
  return { ok: true, url: `${parsed.origin}${path}` }
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '[::1]' || /^127\./.test(host)
  } catch {
    return false
  }
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

export interface ProviderConfig {
  provider: AiProvider
  apiKey:   string | null
  model:    string
  /** Required for `custom`; ignored for the built-in providers. */
  baseUrl?: string | null
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

// ── Errors ───────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly detail = '') {
    super(message)
    this.name = 'ProviderError'
  }
}

function providerName(cfg: Pick<ProviderConfig, 'provider' | 'baseUrl'>): string {
  if (cfg.provider !== 'custom') return PROVIDER_META[cfg.provider].label
  try { return new URL(cfg.baseUrl ?? '').host } catch { return 'the custom endpoint' }
}

function toProviderError(
  cfg:    Pick<ProviderConfig, 'provider' | 'baseUrl'>,
  status: number | undefined,
  raw:    string,
): ProviderError {
  const name = providerName(cfg)
  const text = raw.slice(0, 400)

  if (status === undefined) {
    return new ProviderError(
      cfg.provider === 'custom'
        ? `Could not reach ${name}. Check that Ollama / LM Studio is running and its server is enabled.`
        : `Could not reach ${name}: ${text || 'network error'}`,
      status, raw,
    )
  }
  if (status === 401 || status === 403) {
    return new ProviderError(`${name} rejected the API key (${status}). Check it in Settings → ARIA.`, status, raw)
  }
  if (status === 429) {
    return new ProviderError(
      /quota|billing|credit/i.test(raw)
        ? `${name}: quota or credit exhausted on this key.`
        : `${name} rate limit reached. Wait a moment and try again.`,
      status, raw,
    )
  }
  if (/context.?length|context window|maximum context|prompt is too long|too many tokens/i.test(raw)) {
    return new ProviderError(
      'The conversation is too long for this model\'s context window. Start a new chat or pick a model with a larger context.',
      status, raw,
    )
  }
  if (status === 404) {
    return new ProviderError(
      cfg.provider === 'custom'
        ? `Model or endpoint not found on ${name}. Check the base URL and that the model is downloaded/loaded. (${text})`
        : `That model is not available for this key. Pick another model in Settings → ARIA. (${text})`,
      status, raw,
    )
  }
  return new ProviderError(`${name} error ${status}: ${text || 'request failed'}`, status, raw)
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError)
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropicTurn(
  cfg:          ProviderConfig,
  systemPrompt: string,
  messages:     AnthropicMessage[],
  tools:        unknown[],
  maxTokens:    number,
  onChunk:      (text: string) => void,
  signal?:      AbortSignal,
): Promise<ProviderTurnResult> {
  const client   = new Anthropic({ apiKey: cfg.apiKey ?? '' })
  const fallback = FALLBACK_CAPABLE.has(cfg.model)

  let finalMsg: Anthropic.Beta.BetaMessage
  try {
    const runner = client.beta.messages.stream({
      model:         cfg.model,
      max_tokens:    maxTokens,
      system:        systemPrompt,
      tools:         tools as Anthropic.Beta.BetaToolUnion[],
      messages:      messages as Anthropic.Beta.BetaMessageParam[],
      // The agent loop resends the same prefix every turn — cache it.
      cache_control: { type: 'ephemeral' },
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    }, { signal })

    runner.on('text', (text) => {
      if (!signal?.aborted) onChunk(text)
    })

    finalMsg = await runner.finalMessage()
  } catch (err) {
    if (isAbort(err)) throw err
    if (err instanceof Anthropic.APIConnectionError) throw toProviderError(cfg, undefined, err.message)
    if (err instanceof Anthropic.APIError) throw toProviderError(cfg, err.status, err.message)
    throw err
  }

  const toolCalls: ToolCall[] = []
  let textCollected = ''

  for (const block of finalMsg.content) {
    if (block.type === 'text') {
      textCollected += block.text
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input })
    }
  }

  if (finalMsg.stop_reason === 'refusal') {
    const note = '\n\n⚠️ The model declined to continue this request. Rephrase it or pick another model in Settings → ARIA.'
    onChunk(note)
    textCollected += note
  }

  return {
    toolCalls,
    // Echo the full content back unchanged: thinking and fallback blocks must
    // round-trip for the next turn of the tool loop.
    assistantContent: finalMsg.content,
    inputTokens:      finalMsg.usage.input_tokens
                      + (finalMsg.usage.cache_read_input_tokens ?? 0)
                      + (finalMsg.usage.cache_creation_input_tokens ?? 0),
    outputTokens:     finalMsg.usage.output_tokens,
    stopReason:       finalMsg.stop_reason ?? 'end_turn',
    textCollected,
  }
}

// ── OpenAI-compatible (OpenAI, Grok, Ollama, LM Studio, vLLM…) ───────────────

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
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try { yield JSON.parse(data) as Record<string, unknown> } catch { /* ignore malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function openAIBase(cfg: ProviderConfig): string {
  return cfg.provider === 'custom' ? (cfg.baseUrl ?? '') : PROVIDER_META[cfg.provider].baseUrl!
}

function openAIHeaders(cfg: Pick<ProviderConfig, 'apiKey'>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      if (typeof json.error === 'string') return json.error
      return json.error?.message ?? json.message ?? text
    } catch {
      return text
    }
  } catch {
    return ''
  }
}

async function postChatCompletion(
  cfg:    ProviderConfig,
  body:   Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  try {
    return await fetch(`${openAIBase(cfg)}/chat/completions`, {
      method:  'POST',
      headers: openAIHeaders(cfg),
      body:    JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    throw toProviderError(cfg, undefined, err instanceof Error ? err.message : String(err))
  }
}

async function callOpenAICompatTurn(
  cfg:          ProviderConfig,
  systemPrompt: string,
  messages:     AnthropicMessage[],
  tools:        unknown[],
  maxTokens:    number,
  onChunk:      (text: string) => void,
  signal?:      AbortSignal,
): Promise<ProviderTurnResult> {
  const meta = PROVIDER_META[cfg.provider]
  let tokenParam: string = meta.tokenParam
  let withTools = tools.length > 0
  let notice    = ''

  const buildBody = (): Record<string, unknown> => ({
    model:        cfg.model,
    stream:       true,
    [tokenParam]: maxTokens,
    ...(meta.streamUsage ? { stream_options: { include_usage: true } } : {}),
    ...(withTools ? { tools: TOOLS_ANTHROPIC_TO_OPENAI(tools) } : {}),
    messages:     toOpenAIMessages(systemPrompt, messages),
  })

  // One request, plus at most one retry per known incompatibility:
  // the output-cap field name, and models that can't do tool calling.
  let response: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await postChatCompletion(cfg, buildBody(), signal)
    if (res.ok && res.body) { response = res; break }

    const reason = await readErrorBody(res)
    if (res.status === 400 && reason.includes(tokenParam) && attempt === 0) {
      tokenParam = tokenParam === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'
      continue
    }
    if (withTools && /does not support tools|tools? (are|is) not supported|tool.?(use|calling).*not supported/i.test(reason)) {
      withTools = false
      notice = `_Note: ${cfg.model} does not support tool calling, so ARIA can explain but cannot run commands. Pick a tool-capable model (e.g. qwen2.5, llama3.1) to let ARIA execute._\n\n`
      continue
    }
    throw toProviderError(cfg, res.status, reason || `HTTP ${res.status}`)
  }
  if (!response?.body) throw toProviderError(cfg, 400, 'Request rejected by the provider.')

  if (notice) onChunk(notice)

  const toolAcc: Array<{ id: string; name: string; args: string }> = []
  let textCollected = notice
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
          index?: number
          id?: string
          function?: { name?: string; arguments?: string | Record<string, unknown> }
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

    for (const [pos, tc] of (delta?.tool_calls ?? []).entries()) {
      // Some local servers omit `index` or send each call whole, keyed only by id.
      let slot = tc.index
      if (slot === undefined) {
        const byId = tc.id ? toolAcc.findIndex((t) => t.id === tc.id) : -1
        slot = byId >= 0 ? byId : tc.id ? toolAcc.length : Math.max(toolAcc.length - 1, pos)
      }
      const acc = (toolAcc[slot] ??= { id: '', name: '', args: '' })
      if (tc.id) acc.id = tc.id
      if (tc.function?.name) acc.name += tc.function.name
      const args = tc.function?.arguments
      if (typeof args === 'string') acc.args += args
      else if (args && typeof args === 'object') acc.args = JSON.stringify(args)
    }
  }

  const toolCalls: ToolCall[] = []
  const contentBlocks: unknown[] = []

  if (textCollected) {
    contentBlocks.push({ type: 'text', text: textCollected })
  }

  toolAcc.forEach((acc, i) => {
    if (!acc?.name) return
    let input: unknown = {}
    try { input = acc.args ? JSON.parse(acc.args) : {} } catch { input = { raw: acc.args } }
    const tc: ToolCall = { id: acc.id || `call_${i}_${acc.name}`, name: acc.name, input }
    toolCalls.push(tc)
    contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
  })

  return {
    toolCalls,
    assistantContent: contentBlocks,
    inputTokens,
    outputTokens,
    stopReason,
    textCollected,
  }
}

// ── Public entry points ──────────────────────────────────────────────────────

export async function callLocalTurn(
  cfg:          ProviderConfig,
  systemPrompt: string,
  messages:     AnthropicMessage[],
  tools:        unknown[],
  maxTokens:    number,
  onChunk:      (text: string) => void,
  signal?:      AbortSignal,
): Promise<ProviderTurnResult> {
  return cfg.provider === 'anthropic'
    ? callAnthropicTurn(cfg, systemPrompt, messages, tools, maxTokens, onChunk, signal)
    : callOpenAICompatTurn(cfg, systemPrompt, messages, tools, maxTokens, onChunk, signal)
}

/** Lists model IDs the key/endpoint can use. */
export async function listProviderModels(
  cfg: Omit<ProviderConfig, 'model'>,
): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  try {
    if (cfg.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: cfg.apiKey ?? '', timeout: 15_000, maxRetries: 0 })
      const models: string[] = []
      for await (const m of client.models.list({ limit: 100 })) models.push(m.id)
      return { ok: true, models }
    }

    const full = { ...cfg, model: '' }
    let res: Response
    try {
      res = await fetch(`${openAIBase(full)}/models`, {
        headers: openAIHeaders(cfg),
        signal:  AbortSignal.timeout(15_000),
      })
    } catch (err) {
      throw toProviderError(cfg, undefined, err instanceof Error ? err.message : String(err))
    }
    if (!res.ok) throw toProviderError(cfg, res.status, await readErrorBody(res))
    const json = await res.json() as { data?: Array<{ id?: string }> }
    const models = (json.data ?? []).map((m) => m.id).filter((id): id is string => !!id).sort()
    return { ok: true, models }
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, message: toProviderError(cfg, undefined, err.message).message }
    if (err instanceof Anthropic.APIError) return { ok: false, message: toProviderError(cfg, err.status, err.message).message }
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Checks the key/endpoint without spending tokens: lists models and confirms
 * the selected one is among them.
 */
export async function testProviderConnection(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
  const name   = providerName(cfg)
  const listed = await listProviderModels(cfg)
  if (!listed.ok) return { ok: false, message: listed.message }

  if (!cfg.model) {
    return listed.models.length
      ? { ok: true, message: `Connected to ${name}. Pick one of ${listed.models.length} models below.` }
      : { ok: false, message: `Connected to ${name}, but no models are loaded. Pull or load a model first.` }
  }
  if (listed.models.length && !listed.models.includes(cfg.model)) {
    return { ok: false, message: `Connected to ${name}, but model "${cfg.model}" is not available. Pick another model.` }
  }
  return { ok: true, message: `Connected to ${name} · ${cfg.model}` }
}
