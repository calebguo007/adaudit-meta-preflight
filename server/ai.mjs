// AI provider client.
//
// Default path: OpenAI-compatible chat completions for DeepSeek gateway,
// OpenRouter, Vultr Serverless Inference, or OpenAI itself.
//
// Gemini sponsor path: set GOOGLE_GENAI_USE_VERTEXAI=true to use Gemini on
// Vertex AI with Application Default Credentials (ADC), which is the auth mode
// Google Cloud is showing in the hackathon account.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GoogleGenAI } from '@google/genai'

// Tiny .env loader (Node 24 also has --env-file but we want zero-config Docker).
function loadEnv() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnv()

const BASE_URL = process.env.AI_BASE_URL || 'https://tokendance.space/gateway/v1'
const API_KEY = process.env.AI_API_KEY || ''
const MODEL = process.env.AI_MODEL || 'deepseek-v4-pro'

const USE_VERTEX = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true'
const GOOGLE_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || ''
const GOOGLE_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

// Image generation / editing model — known as "Nano Banana" in Google branding.
// Used for visible annotation of the uploaded creative (image-in, image-out).
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'gemini-2.5-flash-image'

let vertexClient

if (!USE_VERTEX && !API_KEY) {
  console.warn('[ai] AI_API_KEY not set. OpenAI-compatible agent calls will fail at runtime.')
}

if (USE_VERTEX && !GOOGLE_PROJECT) {
  console.warn('[ai] GOOGLE_CLOUD_PROJECT not set. Vertex AI agent calls will fail at runtime.')
}

function getVertexClient() {
  if (!vertexClient) {
    vertexClient = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_PROJECT,
      location: GOOGLE_LOCATION,
    })
  }
  return vertexClient
}

function parseJsonContent(content) {
  const raw = String(content || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const unfenced = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    try {
      return JSON.parse(unfenced)
    } catch {}

    const start = unfenced.indexOf('{')
    const end = unfenced.lastIndexOf('}')
    if (start !== -1 && end > start) {
      const candidate = unfenced.slice(start, end + 1)
      try { return JSON.parse(candidate) } catch {}
    }

    const arrayStart = unfenced.indexOf('[')
    const arrayEnd = unfenced.lastIndexOf(']')
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      const candidate = unfenced.slice(arrayStart, arrayEnd + 1)
      try { return JSON.parse(candidate) } catch {}
    }
  }
  return null
}

function jsonInstruction(json) {
  return json
    ? '\n\nReturn only valid JSON. Do not wrap it in markdown fences. Do not add commentary.'
    : ''
}

// Strip a data URL prefix and return { mimeType, base64 }. Accepts either a
// raw base64 string or a "data:image/jpeg;base64,..." form.
function parseDataUrl(input) {
  if (!input || typeof input !== 'string') return null
  const m = input.match(/^data:([^;]+);base64,(.+)$/)
  if (m) return { mimeType: m[1], base64: m[2] }
  // assume plain base64, default to jpeg
  return { mimeType: 'image/jpeg', base64: input }
}

/**
 * Multimodal Vision call: gives Gemini 2.5 Flash an image + a prompt.
 * Used by /api/workspace/stream when the marketer uploads a creative.
 * Returns parsed JSON when json=true.
 */
export async function callVertexVision({
  system,
  user,
  image,
  json = false,
  temperature = 0.2,
  maxTokens = 700,
}) {
  if (!USE_VERTEX) {
    throw new Error('callVertexVision requires GOOGLE_GENAI_USE_VERTEXAI=true')
  }
  const decoded = parseDataUrl(image?.data_url || image?.base64 || image)
  if (!decoded) throw new Error('callVertexVision: image data required')

  const client = getVertexClient()
  const promptText = `${system || ''}\n\n${user || ''}${jsonInstruction(json)}`.trim()

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: decoded.mimeType, data: decoded.base64 } },
          { text: promptText },
        ],
      },
    ],
    config: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  })

  const content = response.text || ''
  if (json) {
    const preview = content.replace(/\s+/g, ' ').slice(0, 500)
    console.log(`[ai:vision] model=${GEMINI_MODEL} chars=${content.length} preview="${preview}"`)
    const parsed = parseJsonContent(content)
    if (!parsed) throw new Error(`Vertex vision JSON parse failed: ${preview}`)
    return parsed
  }
  return content
}

/**
 * Nano Banana annotation: image-in, image-out. Asks gemini-2.5-flash-image to
 * draw editorial annotations (numbered circles, light highlights) directly on
 * the uploaded creative based on the findings from the Vision step.
 *
 * Returns { mimeType, base64 } of the annotated image, or null on failure
 * (caller should fall back to coord-based markers).
 */
export async function callNanoBananaAnnotate({
  image,
  findings,
  prompt,
  temperature = 0.3,
}) {
  if (!USE_VERTEX) {
    throw new Error('callNanoBananaAnnotate requires GOOGLE_GENAI_USE_VERTEXAI=true')
  }
  const decoded = parseDataUrl(image?.data_url || image?.base64 || image)
  if (!decoded) throw new Error('callNanoBananaAnnotate: image data required')

  const client = getVertexClient()
  const findingsBullets = Array.isArray(findings) && findings.length
    ? findings.map((f, i) => `${i + 1}. ${f.label || f.text || JSON.stringify(f)}${f.severity ? ` (${f.severity})` : ''}`).join('\n')
    : '(no specific findings — annotate any visible headline, CTA, and proof element)'

  const editPrompt =
    prompt ||
    `Add concise editorial annotations to this ad creative as if a senior media buyer is reviewing it. ` +
    `For each of the items below, draw a small numbered circle in red (or amber for medium severity, green for low) over the relevant region of the image. ` +
    `Do not redraw the underlying creative. Preserve the original composition. ` +
    `Findings to mark:\n${findingsBullets}\n\n` +
    `Output: the same image with the small numbered circles overlaid in the correct positions. No text overlays beyond the small numbers inside the circles.`

  const response = await client.models.generateContent({
    model: NANO_BANANA_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: decoded.mimeType, data: decoded.base64 } },
          { text: editPrompt },
        ],
      },
    ],
    config: {
      temperature,
      responseModalities: ['IMAGE'],
    },
  })

  const parts = response?.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) {
      return {
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        base64: inline.data,
      }
    }
  }
  console.warn(`[ai:nano-banana] no image in response. text fallback: ${response.text?.slice(0, 200) || ''}`)
  return null
}

async function callVertexAgent({ system, user, json = false, temperature = 0.3, maxTokens = 800 }) {
  const client = getVertexClient()
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: `${system}\n\nUser request:\n${user}${jsonInstruction(json)}`,
    config: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  })

  const content = response.text || ''
  if (json) {
    const preview = content.replace(/\s+/g, ' ').slice(0, 500)
    console.log(`[ai:vertex] raw_json_preview model=${GEMINI_MODEL} chars=${content.length} preview="${preview}"`)
    const parsed = parseJsonContent(content)
    if (!parsed) {
      throw new Error(`Vertex JSON parse failed: ${preview}`)
    }
    return parsed
  }
  return content
}

/**
 * Non-streaming chat completion. Returns the assistant message content string.
 * If json=true, parses the response as JSON and returns the object (or null on parse fail).
 */
export async function callAgent({ system, user, json = false, temperature = 0.3, maxTokens = 800 }) {
  if (USE_VERTEX) {
    return callVertexAgent({ system, user, json, temperature, maxTokens })
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  }
  if (json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI call failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? ''

  if (!json) return content
  const parsed = parseJsonContent(content)
  if (!parsed) throw new Error(`AI JSON parse failed: ${content.slice(0, 300)}`)
  return parsed
}

/**
 * Streaming chat completion. Invokes onChunk(textDelta) as tokens arrive.
 * Vertex mode falls back to one non-streaming response to keep the same API.
 */
export async function streamAgent({ system, user, onChunk, json = false, temperature = 0.3, maxTokens = 800 }) {
  if (USE_VERTEX) {
    const content = await callVertexAgent({ system, user, json, temperature, maxTokens })
    const text = json ? JSON.stringify(content || {}) : content
    onChunk?.(text)
    return text
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true,
  }
  if (json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const text = await res.text?.().catch(() => '') ?? ''
    throw new Error(`AI stream failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line || !line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return full
      try {
        const obj = JSON.parse(payload)
        const delta = obj?.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onChunk?.(delta)
        }
      } catch {
        // ignore non-JSON keepalive lines
      }
    }
  }
  return full
}

export const aiInfo = () => USE_VERTEX
  ? {
      provider: 'vertex-ai',
      baseUrl: 'vertex-ai',
      model: GEMINI_MODEL,
      project: GOOGLE_PROJECT,
      location: GOOGLE_LOCATION,
      hasKey: false,
      auth: 'application-default-credentials',
    }
  : {
      provider: 'openai-compatible',
      baseUrl: BASE_URL,
      model: MODEL,
      hasKey: Boolean(API_KEY),
      auth: 'api-key',
    }
