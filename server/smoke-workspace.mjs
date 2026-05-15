import { spawn } from 'node:child_process'

const PORT = Number(process.env.ADAUDIT_TEST_PORT || 18080)
const BASE = `http://127.0.0.1:${PORT}`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitForHealth(timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('server did not become healthy')
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  return { res, json, text }
}

function validateWorkspace(workspace) {
  assert(workspace?.final_decision?.status === 'READY_PAUSED', 'workspace should end READY_PAUSED')
  const checks = workspace.causal_checks || []
  assert(checks.length >= 6, 'workspace should expose causal checks')
  assert(checks.every((check) => check.passed !== false), 'all causal checks should pass')

  const adSetLimit = workspace.budget_signal?.recommended_ad_set_count
  const adSetCount = workspace.recommended_plan?.ad_sets?.length
  assert(Number.isFinite(adSetLimit), 'budget signal should expose recommended_ad_set_count')
  assert(adSetCount <= adSetLimit, 'recommended plan must obey budget ad-set limit')

  const objective = workspace.recommended_plan?.objective
  const readinessObjective = workspace.delivery_readiness?.objective_recommendation
  if (readinessObjective) {
    assert(objective === readinessObjective, 'recommended objective should follow delivery readiness')
  }

  const diffText = JSON.stringify(workspace.plan_diff || {})
  assert(/claim|hook|copy/i.test(diffText), 'risky claim rewrite should appear in plan diff')
}

async function main() {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      ADAUDIT_DISABLE_LIVE_EVIDENCE: 'true',
      ADAUDIT_FAST_WORKSPACE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const cleanup = () => {
    if (!child.killed) child.kill()
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })

  try {
    await waitForHealth()

    const analyze = await post('/api/workspace/analyze', {
      product: 'AI Resume Optimizer',
      budget_usd: 500,
      audience: 'US job seekers',
      claim: 'Land a job in 7 days',
      landing_page: 'https://example.com/resume-audit',
      target_cpa: 35,
      aov: 120,
      gross_margin: 0.6,
      demo_mode: true,
    })
    assert(analyze.res.ok, `/api/workspace/analyze failed: ${analyze.text}`)
    validateWorkspace(analyze.json.workspace || analyze.json)

    const stream = await post('/api/workspace/stream?demo_mode=true', {
      product: 'AI Resume Optimizer',
      budget_usd: 500,
      demo_mode: true,
    })
    assert(stream.res.ok, `/api/workspace/stream failed: ${stream.text.slice(0, 120)}`)
    assert(stream.text.includes('event: tool_call_start'), 'stream should expose tool call events')
    assert(stream.text.includes('event: workspace_done'), 'stream should finish with workspace_done')

    const paused = await post('/api/campaign/execute', { status: 'PAUSED' })
    assert(paused.res.ok && paused.json.status === 'PAUSED', 'PAUSED execution should succeed')

    const active = await post('/api/campaign/execute', { status: 'ACTIVE' })
    assert(active.res.status === 400, 'ACTIVE execution should be rejected')

    console.log('workspace smoke tests passed')
  } finally {
    cleanup()
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
