import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const port = Number(process.env.PORT || 8080)
const root = resolve(process.cwd(), 'dist')

const badBrief =
  'Launch a $500 Meta test for my AI resume optimizer targeting US job seekers. Promise they can land a job in 7 days.'

const fixedBrief =
  'Launch a $500 paused Meta lead test for an AI resume optimizer. Target US job seekers and early-career founders with proof-first hooks and no guaranteed employment outcome claims.'

const auditorReports = [
  {
    auditor: 'PixelAuditor',
    status: 'fail',
    reason: 'The lead event has not fired in the last 14 days.',
    fix: 'Use Leads or Traffic until the conversion signal is ready.',
  },
  {
    auditor: 'AudienceAuditor',
    status: 'warn',
    reason: 'The audience is broad and likely fragmented for a 3-variant test.',
    fix: 'Split into two intent-led audiences.',
  },
  {
    auditor: 'PolicyAuditor',
    status: 'fail',
    reason: 'The brief contains an employment outcome promise.',
    fix: 'Use proof-based ATS readiness language instead of guaranteed employment claims.',
  },
  {
    auditor: 'BudgetAuditor',
    status: 'fail',
    reason: '$500 cannot support the requested conversion test structure.',
    fix: 'Run two lean lead hypotheses with hold thresholds.',
  },
  {
    auditor: 'CreativeAuditor',
    status: 'warn',
    reason: 'Ad Library evidence favors proof-first hooks.',
    fix: 'Use score lift, before/after proof, and ATS clarity.',
  },
]

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  })
  res.end(JSON.stringify(payload, null, 2))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

async function handleApi(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.url === '/api/health') {
    return json(res, 200, {
      status: 'ok',
      app: 'AdAudit',
      executor: process.env.META_EXECUTOR_MODE || 'mock',
    })
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const body = await readJson(req)

  if (req.url === '/api/brief/parse') {
    return json(res, 200, {
      product: 'AI resume optimizer',
      budget_usd: 500,
      platform: 'Meta',
      geo: ['US'],
      audience: ['job seekers'],
      risky_claims: ['land a job in 7 days'],
      raw: body.text || badBrief,
    })
  }

  if (req.url === '/api/evidence/analyze') {
    return json(res, 200, {
      source: 'Gemini-compatible multimodal evidence fixture',
      ad_library_sample_size: 18,
      patterns: [
        'Proof-first hooks outperform guaranteed outcome claims in this category.',
        'Most active ads frame ATS as the obstacle and show a score improvement.',
        'Employment outcome promises are policy-sensitive and should be avoided.',
      ],
    })
  }

  if (req.url === '/api/preflight/run') {
    return json(res, 200, {
      decision: 'HOLD',
      coordinator_summary:
        'I will not launch this campaign yet. Fix tracking readiness, policy wording, audience structure, and budget math first.',
      reports: auditorReports,
    })
  }

  if (req.url === '/api/campaign/fix') {
    return json(res, 200, {
      decision: 'READY_PAUSED',
      fixed_brief: body.brief || fixedBrief,
      plan: {
        objective: 'LEADS',
        budget_usd: 500,
        status: 'PAUSED',
        ad_sets: [
          { name: 'Early-career job seekers', budget_usd: 250, hook: 'Raise your ATS score before you apply' },
          { name: 'Founder/operator job switchers', budget_usd: 250, hook: 'See what resume robots reject' },
        ],
      },
    })
  }

  if (req.url === '/api/campaign/execute') {
    return json(res, 200, {
      executor_mode: process.env.META_EXECUTOR_MODE || 'mock',
      status: 'PAUSED',
      campaign_id: '23868140291',
      adset_ids: ['23868140292', '23868140293'],
      ad_ids: ['23868140296', '23868140297'],
      note: 'Mock mode is Meta-compatible fallback. Set META_EXECUTOR_MODE=real and wire the Meta Ads CLI in production.',
    })
  }

  return json(res, 404, { error: 'Unknown API route' })
}

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
})
