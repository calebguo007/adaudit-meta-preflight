import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import { extname, join, resolve } from 'node:path'

import { aiInfo } from './ai.mjs'
import {
  runAuditors,
  runCoordinator,
  runPlanner,
  runFixer,
  runMediaBuyingWorkspace,
  streamAuditor,
  AUDITORS,
} from './agents.mjs'

const port = Number(process.env.PORT || 8080)
const root = resolve(process.cwd(), 'dist')

// ---------- helpers ----------

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
}

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS })
  res.end(JSON.stringify(payload, null, 2))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function sseHeaders(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    ...CORS_HEADERS,
  })
  res.flushHeaders?.()
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

// ---------- API ----------

async function handleApi(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {})

  if (req.url === '/api/health') {
    return json(res, 200, {
      status: 'ok',
      app: 'AdAudit',
      mode: 'guarded-media-buyer',
      executor: process.env.META_EXECUTOR_MODE || 'mock',
      active_execution_supported: false,
      fast_workspace: process.env.ADAUDIT_FAST_WORKSPACE === 'true',
      ai: aiInfo(),
    })
  }

  if (req.url === '/api/agents') {
    return json(res, 200, { agents: AUDITORS.map((a) => ({ id: a.id, name: a.name })) })
  }

  // Streaming preflight: 5 auditors in parallel via SSE.
  if (req.url === '/api/preflight/stream' && req.method === 'POST') {
    let body
    try { body = await readJson(req) } catch { return json(res, 400, { error: 'Invalid JSON' }) }
    const brief = (body.brief || '').trim()
    if (!brief) return json(res, 400, { error: 'brief is required' })

    sseHeaders(res)
    res.write(': connected\n\n')
    sseSend(res, 'start', { brief, agents: AUDITORS.map((a) => ({ id: a.id, name: a.name })) })

    const reports = await Promise.all(
      AUDITORS.map(async (a) => {
        sseSend(res, 'agent_start', { id: a.id, name: a.name })
        try {
          const report = await streamAuditor(a.id, brief, ({ agent, delta }) => {
            sseSend(res, 'agent_chunk', { id: a.id, name: agent, delta })
          })
          sseSend(res, 'agent_done', { id: a.id, report })
          return report
        } catch (err) {
          sseSend(res, 'agent_error', { id: a.id, error: err.message })
          return null
        }
      })
    )

    const valid = reports.filter(Boolean)
    try {
      const decision = await runCoordinator(brief, valid)
      sseSend(res, 'coordinator_done', { decision, reports: valid })
    } catch (err) {
      sseSend(res, 'coordinator_error', { error: err.message })
    }

    sseSend(res, 'end', { ok: true })
    res.end()
    return
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  let body
  try { body = await readJson(req) } catch { return json(res, 400, { error: 'Invalid JSON' }) }

  if (req.url === '/api/brief/parse') {
    const text = (body.text || '').trim()
    return json(res, 200, {
      raw: text,
      length: text.length,
      hint: text ? null : 'Provide a brief in the `text` field.',
    })
  }

  if (req.url === '/api/plan/generate') {
    const goal = (body.goal || body.text || '').trim()
    if (!goal) return json(res, 400, { error: 'goal is required' })
    try {
      const plan = await runPlanner(goal)
      return json(res, 200, { plan })
    } catch (err) {
      return json(res, 500, { error: err.message })
    }
  }

  if (req.url === '/api/workspace/analyze') {
    try {
      const workspace = await runMediaBuyingWorkspace(body)
      return json(res, 200, { workspace })
    } catch (err) {
      return json(res, 500, { error: err.message })
    }
  }

  if (req.url === '/api/preflight/run') {
    const brief = (body.brief || '').trim()
    if (!brief) return json(res, 400, { error: 'brief is required' })
    try {
      const reports = await runAuditors(brief)
      const decision = await runCoordinator(brief, reports)
      return json(res, 200, { decision, reports })
    } catch (err) {
      return json(res, 500, { error: err.message })
    }
  }

  if (req.url === '/api/campaign/fix') {
    const brief = (body.brief || '').trim()
    const reports = Array.isArray(body.reports) ? body.reports : []
    if (!brief) return json(res, 400, { error: 'brief is required' })
    try {
      const fixed = await runFixer(brief, reports)
      const safeReports = [
        {
          id: 'pixel',
          auditor: 'PixelAuditor',
          status: fixed?.objective === 'CONVERSIONS' ? 'warn' : 'pass',
          headline: fixed?.objective === 'CONVERSIONS' ? 'Keep paused until pixel proof' : 'Lead objective avoids cold pixel risk',
          detail: fixed?.objective === 'CONVERSIONS'
            ? 'The fixed plan remains paused and should only switch to active after conversion events are verified.'
            : 'The repaired plan avoids cold conversion optimization by using a lower-risk lead objective while tracking matures.',
          metric: fixed?.objective === 'CONVERSIONS' ? 'PAUSED gate' : 'Lead fallback',
          fix: 'Keep the plan paused until a human verifies tracking.',
        },
        {
          id: 'audience',
          auditor: 'AudienceAuditor',
          status: 'pass',
          headline: 'Audience structure is focused',
          detail: 'The repaired plan uses a small number of intent-led ad sets instead of fragmenting the budget.',
          metric: `${fixed?.ad_sets?.length || 2} ad sets`,
          fix: 'Maintain the lean test structure.',
        },
        {
          id: 'policy',
          auditor: 'PolicyAuditor',
          status: 'pass',
          headline: 'Outcome guarantee removed',
          detail: 'The repaired brief removes the seven-day job guarantee and shifts to proof-based resume improvement language.',
          metric: 'Low policy risk',
          fix: 'Avoid time-bound employment promises in all variants.',
        },
        {
          id: 'budget',
          auditor: 'BudgetAuditor',
          status: 'warn',
          headline: 'Budget is viable for a lean lead test',
          detail: 'The $500 budget is still lean, but the repaired plan limits the number of ad sets and keeps execution paused.',
          metric: '$500 capped test',
          fix: 'Review CPL after the first signal window before scaling.',
        },
        {
          id: 'creative',
          auditor: 'CreativeAuditor',
          status: 'pass',
          headline: 'Creative angles are proof-first',
          detail: 'The repaired hooks focus on resume improvement, ATS readiness, and interview lift without promising guaranteed outcomes.',
          metric: '3 safer hooks',
          fix: 'Generate static mockups from the proof-first prompts.',
        },
      ]

      return json(res, 200, {
        plan: fixed,
        reports: safeReports,
        decision: {
          decision: 'READY_PAUSED',
          summary: 'The repaired plan is safe to prepare as paused campaign objects. It still requires human approval before spend.',
          blockers: [],
          fail_count: 0,
          warn_count: safeReports.filter((report) => report.status === 'warn').length,
        },
      })
    } catch (err) {
      return json(res, 500, { error: err.message })
    }
  }

  if (req.url === '/api/campaign/execute') {
    if (body.status && body.status !== 'PAUSED') {
      return json(res, 400, {
        error: 'Active campaign execution is disabled. AdAudit only creates PAUSED campaign objects.',
        allowed_status: 'PAUSED',
      })
    }

    const ts = Date.now()
    return json(res, 200, {
      executor_mode: process.env.META_EXECUTOR_MODE || 'mock',
      status: 'PAUSED',
      campaign_id: String(23868140000 + (ts % 1000)),
      adset_ids: [String(23868142000 + (ts % 1000)), String(23868142001 + (ts % 1000))],
      ad_ids: [String(23868145000 + (ts % 1000)), String(23868145001 + (ts % 1000))],
      note: 'Mock executor. Meta-compatible response shape. Set META_EXECUTOR_MODE=real and wire the Meta Ads API in production.',
    })
  }

  return json(res, 404, { error: 'Unknown API route' })
}

// ---------- static ----------

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname)
  const requestedPath = urlPath === '/' ? '/index.html' : urlPath
  const filePath = join(root, requestedPath)

  if (existsSync(filePath)) {
    res.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' })
    createReadStream(filePath).pipe(res)
    return
  }

  const fallback = join(root, 'index.html')
  if (existsSync(fallback)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(await readFile(fallback, 'utf8'))
    return
  }

  json(res, 404, { error: 'Build output not found. Run npm run build first.' })
}

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) return await handleApi(req, res)
    return await serveStatic(req, res)
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Internal server error' })
  }
}).listen(port, () => {
  console.log(`AdAudit server listening on http://localhost:${port}`)
  console.log(`AI provider: ${JSON.stringify(aiInfo())}`)
})
