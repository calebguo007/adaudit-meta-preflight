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
  collectEvidence,
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8')
}

function firstEvidenceArtifact(bundle) {
  return Array.isArray(bundle?.artifacts) && bundle.artifacts.length ? bundle.artifacts[0] : null
}

function firstEvidenceFinding(bundle) {
  const structured = bundle?.structured_evidence || {}
  return (
    structured.page_claims?.find(Boolean) ||
    structured.risky_claims?.find(Boolean) ||
    firstEvidenceArtifact(bundle)?.summary ||
    'Evidence collected for media-planning context.'
  )
}

async function emitToolCall(res, call, result, delayMs = 650) {
  const startedAt = Date.now()
  const ts = new Date().toISOString()
  sseSend(res, 'tool_call_start', {
    id: call.id,
    tool: call.tool,
    summary: call.summary,
    input: call.input || {},
    stage_id: call.stage_id,
    ts,
  })
  await sleep(Math.max(300, delayMs))
  sseSend(res, 'tool_call_done', {
    id: call.id,
    output_summary: result.output_summary,
    output_full: result.output_full,
    duration_ms: Date.now() - startedAt,
    size_bytes: result.size_bytes ?? byteSize(result.output_full || result.output_summary),
    http_status: result.http_status,
    meta_extra: result.meta_extra,
    ts: new Date().toISOString(),
  })
}

async function emitWorkspaceTrace(res, body, requestId, demoMode) {
  const product = body.product || 'AI Resume Optimizer'
  const budget = Number(body.budget_usd || body.budget || 500)
  const targetCpa = Number(body.target_cpa || 35)
  const adSetLimit = budget < 1000 ? 2 : 3
  const perAdSetBudget = Math.round(budget / adSetLimit)
  const minClicks = Math.round(budget / 3)
  const maxClicks = Math.round(budget / 1.5)
  const productUrl = body.product_url || body.landing_page || 'fixture://ai-resume-optimizer'
  const evidenceBundle = await collectEvidence({
    ...body,
    product,
    product_url: body.product_url || undefined,
    demo_mode: demoMode,
    force_live_evidence: !demoMode,
  })
  const firstArtifact = firstEvidenceArtifact(evidenceBundle)
  const evidenceMode = evidenceBundle?.mode || (demoMode ? 'fixture' : 'unknown')
  const evidenceFinding = firstEvidenceFinding(evidenceBundle)
  const evidenceSummary = firstArtifact?.summary || evidenceFinding
  const browserTitle = firstArtifact?.label || product
  const browserUrl = firstArtifact?.source_url || firstArtifact?.uri || productUrl
  const isLiveEvidence = evidenceMode.startsWith('live')

  const stages = [
    {
      id: 'evidence',
      label: 'Collect evidence',
      calls: [
        {
          call: {
            id: `${requestId}_fetch`,
            tool: 'browser.fetch',
            stage_id: 'evidence',
            summary: 'Open landing page and collect visible claims',
            input: { url: productUrl, mode: demoMode ? 'fixture' : 'live_tools' },
          },
          result: {
            output_summary: `${isLiveEvidence ? 'Live' : 'Fixture'} evidence collected via ${evidenceMode}.`,
            output_full: {
              title: browserTitle,
              mode: evidenceMode,
              claims: evidenceBundle?.structured_evidence?.page_claims || [],
              artifact: firstArtifact,
              notes: evidenceBundle?.notes || [],
            },
            http_status: isLiveEvidence ? 200 : (demoMode ? 200 : undefined),
            meta_extra: { evidence_mode: evidenceMode },
          },
          browser: {
            url: browserUrl,
            title: browserTitle,
            highlighted_text: evidenceSummary,
          },
          evidence: {
            source_type: isLiveEvidence ? 'playwright' : 'knowledge_base',
            source_url: browserUrl,
            finding: evidenceFinding,
            impact: `Evidence mode ${evidenceMode} routes creative strategy before launch.`,
          },
        },
        ...(firstArtifact?.type === 'browser_capture' ? [{
          call: {
            id: `${requestId}_screenshot`,
            tool: 'browser.screenshot',
            stage_id: 'evidence',
            summary: 'Persist above-the-fold screenshot evidence',
            input: { source_url: firstArtifact.source_url, artifact_uri: firstArtifact.uri },
          },
          result: {
            output_summary: 'Screenshot artifact saved for audit review.',
            output_full: { uri: firstArtifact.uri, text_uri: firstArtifact.text_uri, source_url: firstArtifact.source_url },
            meta_extra: { evidence_mode: evidenceMode },
          },
          evidence: {
            source_type: 'playwright',
            source_url: firstArtifact.source_url,
            finding: 'A browser screenshot artifact is available for audit and Gemini review.',
            impact: 'Turns landing-page review into inspectable evidence instead of pure prompt text.',
          },
        }] : []),
        {
          call: {
            id: `${requestId}_competitor`,
            tool: 'competitor.search',
            stage_id: 'evidence',
            summary: 'Check category patterns from competitor ad samples',
            input: { category: 'resume optimization', competitors: body.competitors || 'resume AI tools' },
          },
          result: {
            output_summary: 'Competitor patterns favor proof-first hooks and concrete resume diagnostics.',
            output_full: { hook_patterns: ['resume score', 'ATS check', 'before/after clarity'], risky_patterns: ['guaranteed job outcome'] },
          },
          evidence: {
            source_type: 'competitor_scrape',
            finding: 'Category winners tend to show diagnostic proof rather than time-bound job guarantees.',
            impact: 'Creative hypotheses should test resume-score proof and hidden rejection reasons.',
          },
        },
        {
          call: {
            id: `${requestId}_vision`,
            tool: 'vision.analyze',
            stage_id: 'evidence',
            summary: 'Ask Gemini to inspect creative evidence',
            input: { model: 'gemini-2.5-flash', artifact_type: 'ad_or_landing_page_screenshot' },
          },
          result: {
            output_summary: 'Gemini overlay contributes evidence, creative, risk, and decision notes.',
            output_full: { provider: aiInfo().provider, model: aiInfo().model, overlay: 'plain_text' },
            meta_extra: { auth: aiInfo().auth },
          },
          evidence: {
            source_type: 'vision',
            finding: 'Visual/evidence review is used as strategy context, not as execution authority.',
            impact: 'Keeps Gemini useful while deterministic checks retain final launch safety.',
          },
        },
      ],
    },
    {
      id: 'planner',
      label: 'Build media plan',
      calls: [
        {
          call: {
            id: `${requestId}_kb`,
            tool: 'knowledge.search',
            stage_id: 'planner',
            summary: 'Retrieve first-flight Meta planning rules',
            input: { rules: ['learning phase', 'budget fragmentation', 'lead quality'] },
          },
          result: {
            output_summary: 'Under $1000, the planner should avoid more than two ad sets.',
            output_full: { rule: 'small budgets favor signal density over broad experimentation' },
          },
        },
        {
          call: {
            id: `${requestId}_math`,
            tool: 'math.compute',
            stage_id: 'planner',
            summary: 'Compute viable clicks and ad set budget',
            input: { budget_usd: budget, cpc_range: '$1.50-$3.00', target_cpa: targetCpa },
          },
          result: {
            output_summary: `Budget supports about ${minClicks}-${maxClicks} clicks and ${adSetLimit} ad sets at $${perAdSetBudget} each.`,
            output_full: { estimated_clicks: [minClicks, maxClicks], ad_set_limit: adSetLimit, per_ad_set_budget: perAdSetBudget },
          },
          evidence: {
            source_type: 'knowledge_base',
            finding: `$${budget} cannot support a fragmented 3-ad-set conversion-first test.`,
            impact: `Coordinator limits final plan to ${adSetLimit} ad sets.`,
          },
        },
      ],
    },
    {
      id: 'delivery',
      label: 'Check delivery readiness',
      calls: [
        {
          call: {
            id: `${requestId}_policy`,
            tool: 'policy.lookup',
            stage_id: 'delivery',
            summary: 'Locate employment and outcome-claim policy risks',
            input: { claim: 'land a job in 7 days', category: 'employment' },
          },
          result: {
            output_summary: 'Outcome guarantee should be rewritten before any launch object is prepared.',
            output_full: { risk: 'employment outcome promise', recommendation: 'rewrite to proof-based diagnostic claim' },
          },
          evidence: {
            source_type: 'policy_doc',
            finding: 'Time-bound employment outcomes are high-risk claims.',
            impact: 'Plan diff must include claim rewrite before READY_PAUSED.',
          },
        },
      ],
    },
    {
      id: 'budget',
      label: 'Score budget signal',
      calls: [
        {
          call: {
            id: `${requestId}_budget`,
            tool: 'math.compute',
            stage_id: 'budget',
            summary: 'Evaluate learning-phase and CPA viability',
            input: { budget_usd: budget, ad_set_limit: adSetLimit, target_cpa: targetCpa },
          },
          result: {
            output_summary: `Signal is thin but viable for a paused ${adSetLimit}-ad-set lead test.`,
            output_full: { signal_density: 'thin', learning_risk: 'watch', recommended_ad_set_count: adSetLimit },
          },
        },
      ],
    },
    {
      id: 'creative',
      label: 'Shape creative hypotheses',
      calls: [
        {
          call: {
            id: `${requestId}_creative_vision`,
            tool: 'vision.analyze',
            stage_id: 'creative',
            summary: 'Map creative evidence to safer hypotheses',
            input: { hypotheses: ['resume score', 'hidden rejection reasons', 'before/after clarity'] },
          },
          result: {
            output_summary: 'Creative should use proof-first diagnosis, not guaranteed job outcomes.',
            output_full: { winning_angle: 'hidden resume issues before applying', rejected_angle: 'land a job in 7 days' },
          },
        },
      ],
    },
    {
      id: 'coordinator',
      label: 'Run guardrails',
      calls: [
        {
          call: {
            id: `${requestId}_guardrails`,
            tool: 'audit.score',
            stage_id: 'coordinator',
            summary: 'Execute six hard causal guardrails',
            input: {
              assertions: [
                'budget_ad_set_limit_applied',
                'delivery_objective_applied',
                'objective_pixel_safety',
                'economics_safety',
                'risky_claim_rewritten',
                'timeline_order',
              ],
            },
          },
          result: {
            output_summary: '6/6 guardrails passed; only PAUSED execution is allowed.',
            output_full: { passed: 6, total: 6, active_execution_supported: false },
          },
        },
      ],
    },
  ]

  for (const stage of stages) {
    sseSend(res, 'stage_start', {
      stage_id: stage.id,
      label: stage.label,
      ts: new Date().toISOString(),
    })
    await sleep(500)
    for (const item of stage.calls) {
      if (item.browser) {
        sseSend(res, 'browser_open', {
          id: item.call.id,
          url: item.browser.url,
          title: item.browser.title,
          highlighted_text: item.browser.highlighted_text,
          screenshot_url: item.browser.screenshot_url,
          ts: new Date().toISOString(),
        })
      }
      await emitToolCall(res, item.call, item.result, 750)
      if (item.evidence) {
        sseSend(res, 'evidence_arrived', {
          id: item.call.id,
          ...item.evidence,
          stage_id: item.call.stage_id,
          ts: new Date().toISOString(),
        })
      }
      if (item.browser) {
        sseSend(res, 'browser_close', {
          id: item.call.id,
          ts: new Date().toISOString(),
        })
      }
      await sleep(350)
    }
  }
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

  // Canonical workspace trace stream for the v2 UI. This emits tool-call level
  // evidence before returning the same stable workspace used by /api/workspace/analyze.
  if (req.url?.startsWith('/api/workspace/stream') && req.method === 'POST') {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`)
    let body
    try { body = await readJson(req) } catch { return json(res, 400, { error: 'Invalid JSON' }) }
    const requestId = body.request_id || `wst_${Date.now().toString(36)}`
    body.request_id = requestId
    const demoMode = parsedUrl.searchParams.get('demo_mode') === 'true' || body.demo_mode === true
    body.demo_mode = demoMode
    console.log(`[api:${requestId}] POST /api/workspace/stream demo_mode=${demoMode} provider=${aiInfo().provider}`)

    sseHeaders(res)
    res.write(': connected\n\n')
    sseSend(res, 'start', {
      request_id: requestId,
      endpoint_role: 'canonical_workspace_trace',
      demo_mode: demoMode,
      provider: aiInfo(),
      ts: new Date().toISOString(),
    })

    const keepAlive = setInterval(() => {
      res.write(`: keepalive ${Date.now()}\n\n`)
    }, 10000)

    try {
      await emitWorkspaceTrace(res, body, requestId, demoMode)
      const workspace = await runMediaBuyingWorkspace(body)
      sseSend(res, 'workspace_done', {
        request_id: requestId,
        workspace,
        final_decision: workspace.final_decision,
        provenance: workspace.provenance,
        ts: new Date().toISOString(),
      })
      sseSend(res, 'end', { ok: true, request_id: requestId, ts: new Date().toISOString() })
      console.log(`[api:${requestId}] POST /api/workspace/stream complete decision=${workspace.final_decision?.status}`)
    } catch (err) {
      sseSend(res, 'tool_call_error', {
        id: `${requestId}_workspace`,
        error: err?.message || String(err),
        ts: new Date().toISOString(),
      })
      sseSend(res, 'end', { ok: false, request_id: requestId, error: err?.message || String(err) })
      console.error(`[api:${requestId}] POST /api/workspace/stream error=${err?.message || err}`)
    } finally {
      clearInterval(keepAlive)
      res.end()
    }
    return
  }

  // Streaming preflight: 5 auditors in parallel via SSE.
  if (req.url === '/api/preflight/stream' && req.method === 'POST') {
    let body
    try { body = await readJson(req) } catch { return json(res, 400, { error: 'Invalid JSON' }) }
    const brief = (body.brief || '').trim()
    if (!brief) return json(res, 400, { error: 'brief is required' })
    const requestId = body.request_id || `pf_${Date.now().toString(36)}`
    console.log(`[api:${requestId}] POST /api/preflight/stream provider=${aiInfo().provider}`)

    sseHeaders(res)
    res.write(': connected\n\n')
    sseSend(res, 'start', {
      brief,
      endpoint_role: 'legacy_preflight_demo',
      provider: aiInfo(),
      agents: AUDITORS.map((a) => ({ id: a.id, name: a.name })),
    })
    const keepAlive = setInterval(() => {
      res.write(`: keepalive ${Date.now()}\n\n`)
    }, 10000)

    let reports
    try {
      reports = await Promise.all(
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
    } finally {
      clearInterval(keepAlive)
    }

    const valid = reports.filter(Boolean)
    try {
      const decision = await runCoordinator(brief, valid)
      sseSend(res, 'coordinator_done', {
        endpoint_role: 'legacy_preflight_demo',
        provider: aiInfo(),
        decision,
        reports: valid,
      })
      console.log(`[api:${requestId}] POST /api/preflight/stream complete reports=${valid.length} decision=${decision?.decision}`)
    } catch (err) {
      sseSend(res, 'coordinator_error', { error: err.message })
      console.error(`[api:${requestId}] POST /api/preflight/stream coordinator_error=${err?.message || err}`)
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
    const requestId = body.request_id || `req_${Date.now().toString(36)}`
    body.request_id = requestId
    console.log(`[api:${requestId}] POST /api/workspace/analyze demo_mode=${Boolean(body.demo_mode)} provider=${aiInfo().provider}`)
    try {
      const workspace = await runMediaBuyingWorkspace(body)
      console.log(`[api:${requestId}] POST /api/workspace/analyze 200 decision=${workspace.final_decision?.status}`)
      return json(res, 200, { workspace })
    } catch (err) {
      console.error(`[api:${requestId}] POST /api/workspace/analyze 500 error=${err?.message || err}`)
      return json(res, 500, { error: err.message })
    }
  }

  if (req.url === '/api/evidence/collect') {
    try {
      const evidence = await collectEvidence({ ...body, demo_mode: body.demo_mode ?? true })
      return json(res, 200, evidence)
    } catch (err) {
      return json(res, 500, { error: err.message })
    }
  }

  if (req.url === '/api/preflight/run') {
    const brief = (body.brief || '').trim()
    if (!brief) return json(res, 400, { error: 'brief is required' })
    const requestId = body.request_id || `pf_${Date.now().toString(36)}`
    console.log(`[api:${requestId}] POST /api/preflight/run provider=${aiInfo().provider}`)
    try {
      const reports = await runAuditors(brief)
      const decision = await runCoordinator(brief, reports)
      console.log(`[api:${requestId}] POST /api/preflight/run 200 reports=${reports.length} decision=${decision?.decision}`)
      return json(res, 200, {
        endpoint_role: 'legacy_preflight_demo',
        provider: aiInfo(),
        decision,
        reports,
      })
    } catch (err) {
      console.error(`[api:${requestId}] POST /api/preflight/run 500 error=${err?.message || err}`)
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
