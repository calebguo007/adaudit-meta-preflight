import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Act = 'intake' | 'reviewing' | 'verdict'
type ToolStatus = 'running' | 'done' | 'error'

type IntakeForm = {
  product: string
  budget: string
  audience: string
  claim: string
  landingPage: string
  targetCpa: string
  aov: string
  margin: string
  creativeDataUrl?: string
  creativeName?: string
}

type RunMode = 'demo' | 'live'

type ToolCall = {
  id: string
  tool: string
  summary: string
  status: ToolStatus
  duration_ms?: number
  size_bytes?: number
  http_status?: number
  meta_extra?: Record<string, unknown> | string
  input?: Record<string, unknown>
  output?: unknown
}

type EvidenceItem = {
  id: string
  source_type: string
  source_url?: string
  finding: string
  impact?: string
  stage_id?: string
}

type BrowserSession = {
  id: string
  url: string
  title?: string
  highlighted_text?: string
  screenshot_url?: string
}

type WorkspaceResult = {
  final_decision?: {
    status?: string
    summary?: string
    human_approval_required?: boolean
  }
  provenance?: {
    request_id?: string
    source?: string
    fallback?: boolean
    latency_ms?: number
    evidence_mode?: string
    paused_only?: boolean
    causal_checks?: { passed?: number; total?: number }
    ai?: { provider?: string; model?: string; location?: string; auth?: string }
  }
  scenarios?: Array<Record<string, unknown>>
  recommended_plan?: {
    scenario_id?: string
    objective?: string
    campaign_name?: string
    ad_sets?: Array<Record<string, unknown>>
    why_this_wins?: string[]
    why_others_lose?: string[]
  }
  budget_signal?: Record<string, unknown>
  budget_economics?: Record<string, unknown>
  unit_economics?: Record<string, unknown>
  delivery_readiness?: Record<string, unknown>
  creative_hypotheses?: Array<Record<string, unknown>>
  evidence?: Array<Record<string, unknown>>
  evidence_artifacts?: Record<string, unknown>
  agent_timeline?: Array<Record<string, unknown>>
  plan_diff?: { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
  causal_checks?: Array<Record<string, unknown>>
  paused_execution_spec?: {
    status?: string
    executor_mode?: string
    campaign?: Record<string, unknown>
    safety_notes?: string[]
  }
  kill_scale_rules?: {
    kill?: string[]
    hold?: string[]
    scale?: string[]
  }
  gemini_overlay?: {
    mode?: string
    lines?: Record<string, string>
    raw?: string
  }
  [key: string]: unknown
}

type ExecuteResult = {
  executor_mode?: string
  status?: string
  campaign_id?: string
  adset_ids?: string[]
  ad_ids?: string[]
  note?: string
}

const SAMPLE_FORM: IntakeForm = {
  product: 'AI Resume Optimizer',
  budget: '500',
  audience: 'US job seekers and career switchers, age 22-45',
  claim: 'Land a job in 7 days',
  landingPage: 'https://example.com/resume-audit',
  targetCpa: '35',
  aov: '120',
  margin: '0.6',
}

const TOOL_LABEL: Record<string, string> = {
  'browser.fetch': 'Read landing page',
  'browser.screenshot': 'Capture creative',
  'knowledge.search': 'Pull buying rules',
  'policy.lookup': 'Check Meta policy',
  'competitor.search': 'Scan competitor ads',
  'vision.analyze': 'Gemini vision review',
  'math.compute': 'Compute signal density',
  'audit.score': 'Run hard guardrails',
}

const SOURCE_LABEL: Record<string, string> = {
  playwright: 'Landing page',
  knowledge_base: 'Media buying knowledge',
  policy_doc: 'Policy reference',
  competitor_scrape: 'Competitor ads',
  vision: 'Gemini vision',
}

function money(value: string | number | undefined, fallback = '-') {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return `$${Math.round(n).toLocaleString()}`
}

function asText(value: unknown, fallback = '-'): string {
  if (value == null || value === '') return fallback
  if (Array.isArray(value)) return value.map((v) => asText(v, '')).filter(Boolean).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function parseBudget(form: IntakeForm) {
  return Number.parseInt(form.budget || '0', 10) || 0
}

function getAdSetCount(budget: number) {
  if (budget >= 1000) return 3
  if (budget >= 300) return 2
  return 1
}

function getClaimRisk(claim: string) {
  const text = claim.toLowerCase()
  if (!text.trim()) return 'none'
  if (/\d+\s*(day|week|hour)|guarantee|land a job|get hired|in \d+/.test(text)) return 'high'
  if (/promise|outcome|win|best|number one/.test(text)) return 'medium'
  return 'low'
}

function planDiffItems(workspace: WorkspaceResult | null) {
  if (!workspace?.plan_diff) return []
  if (Array.isArray(workspace.plan_diff)) return workspace.plan_diff
  return workspace.plan_diff.items || []
}

async function streamWorkspace(
  intake: Record<string, unknown>,
  mode: RunMode,
  signal: AbortSignal,
  handlers: {
    onStageStart: (stage: { stage_id: string; label?: string }) => void
    onToolStart: (call: ToolCall) => void
    onToolDone: (id: string, patch: Partial<ToolCall>) => void
    onToolError: (id: string, error: string) => void
    onBrowserOpen: (session: BrowserSession) => void
    onBrowserClose: (id: string) => void
    onEvidence: (item: EvidenceItem) => void
    onWorkspaceDone: (workspace: WorkspaceResult) => void
    onError: (message: string) => void
  },
) {
  const demoMode = mode === 'demo'
  const res = await fetch(`/api/workspace/stream?demo_mode=${demoMode ? 'true' : 'false'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...intake, demo_mode: demoMode, force_live_evidence: !demoMode }),
    signal,
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    handlers.onError(`Workspace stream failed: ${res.status} ${body.slice(0, 180)}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let index = buffer.indexOf('\n\n')
    while (index !== -1) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      index = buffer.indexOf('\n\n')

      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data = line.slice(5).trim()
      }
      if (!data) continue

      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(data)
      } catch {
        continue
      }

      const str = (key: string) => typeof payload[key] === 'string' ? payload[key] : undefined
      const num = (key: string) => typeof payload[key] === 'number' ? payload[key] : undefined

      if (event === 'stage_start') handlers.onStageStart({ stage_id: str('stage_id') || 'stage', label: str('label') })
      if (event === 'tool_call_start') {
        handlers.onToolStart({
          id: str('id') || `tool_${Date.now()}`,
          tool: str('tool') || 'tool',
          summary: str('summary') || '',
          status: 'running',
          input: typeof payload.input === 'object' && payload.input ? payload.input as Record<string, unknown> : undefined,
        })
      }
      if (event === 'tool_call_done') {
        handlers.onToolDone(str('id') || '', {
          status: 'done',
          duration_ms: num('duration_ms'),
          size_bytes: num('size_bytes'),
          http_status: num('http_status'),
          meta_extra: typeof payload.meta_extra === 'object' && payload.meta_extra ? payload.meta_extra as Record<string, unknown> : str('meta_extra'),
          output: payload.output_full || payload.output_summary,
          summary: str('output_summary'),
        })
      }
      if (event === 'tool_call_error') handlers.onToolError(str('id') || '', str('error') || 'tool failed')
      if (event === 'browser_open') handlers.onBrowserOpen(payload as BrowserSession)
      if (event === 'browser_close') handlers.onBrowserClose(str('id') || '')
      if (event === 'evidence_arrived') handlers.onEvidence(payload as EvidenceItem)
      if (event === 'workspace_done') handlers.onWorkspaceDone((payload.workspace || payload) as WorkspaceResult)
    }
  }
}

function Masthead({ act, workspace }: { act: Act; workspace: WorkspaceResult | null }) {
  const provider = workspace?.provenance?.ai?.provider || 'vertex-ai'
  const model = workspace?.provenance?.ai?.model || 'gemini-2.5-flash'
  const status = act === 'intake' ? 'Brief draft' : act === 'reviewing' ? 'Agent running' : workspace?.final_decision?.status || 'Verdict'

  return (
    <header className="aa-topbar">
      <div className="aa-brand">
        <span className="aa-mark"><span /><span /></span>
        <div>
          <strong>AdAudit</strong>
          <small>Guarded AI media buyer</small>
        </div>
      </div>
      <div className="aa-status">
        <span className="aa-live-dot" />
        <span>{provider} / {model}</span>
        <strong>{status}</strong>
      </div>
    </header>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="aa-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function BudgetMath({ form }: { form: IntakeForm }) {
  const budget = parseBudget(form)
  const adSets = getAdSetCount(budget)
  const perSet = adSets ? Math.round(budget / adSets) : 0
  const clicksLow = budget ? Math.round(budget / 3) : 0
  const clicksHigh = budget ? Math.round(budget / 1.5) : 0
  const cpa = Number(form.targetCpa || 0)
  const aov = Number(form.aov || 0)
  const margin = Number(form.margin || 0)
  const breakeven = aov && margin ? aov * margin : 0

  return (
    <div className="aa-budget-strip">
      <Metric label="Budget" value={money(budget)} detail={`${adSets} ad sets, ${money(perSet)} each`} />
      <Metric label="Expected clicks" value={budget ? `${clicksLow}-${clicksHigh}` : '-'} detail="@ $1.50-$3.00 CPC" />
      <Metric label="Target CPA" value={money(cpa)} detail={breakeven ? `breakeven ${money(breakeven)}` : 'needs economics'} />
      <Metric label="Learning signal" value={budget >= 1000 ? 'strong' : budget >= 300 ? 'thin' : 'weak'} detail="first-flight estimate" tone={budget >= 300 ? 'warn' : 'risk'} />
    </div>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'ready' | 'warn' | 'risk' }) {
  return (
    <div className={`aa-metric ${tone ? `is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

function Intake({
  form,
  setForm,
  runMode,
  setRunMode,
  onRun,
}: {
  form: IntakeForm
  setForm: (form: IntakeForm) => void
  runMode: RunMode
  setRunMode: (mode: RunMode) => void
  onRun: () => void
}) {
  const budget = parseBudget(form)
  const claimRisk = getClaimRisk(form.claim)
  const canRun = form.product.trim() && budget > 0

  const patch = (next: Partial<IntakeForm>) => setForm({ ...form, ...next })
  const onFile = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => patch({ creativeDataUrl: String(reader.result), creativeName: file.name })
    reader.readAsDataURL(file)
  }

  return (
    <main className="aa-page aa-intake">
      <section className="aa-hero">
        <div className="aa-kicker">Meta campaign preflight</div>
        <h1>The media buyer that audits before it spends.</h1>
        <p>
          Enter the product, budget, target economics, audience, and creative. AdAudit builds a Meta test plan,
          checks policy and signal density, then prepares only a paused launch.
        </p>
        <div className="aa-actions">
          <button className="aa-primary" type="button" disabled={!canRun} onClick={onRun}>Run guarded media plan</button>
          <button className="aa-secondary" type="button" onClick={() => setForm(SAMPLE_FORM)}>Load risky demo brief</button>
        </div>
        <div className="aa-run-mode" role="group" aria-label="Execution mode">
          <button type="button" className={runMode === 'demo' ? 'active' : ''} onClick={() => setRunMode('demo')}>
            Demo trace
            <small>stable recording path</small>
          </button>
          <button type="button" className={runMode === 'live' ? 'active' : ''} onClick={() => setRunMode('live')}>
            Live tools
            <small>browser fetch + Vertex AI</small>
          </button>
        </div>
      </section>

      <section className="aa-intake-grid">
        <div className="aa-form-panel">
          <div className="aa-panel-head">
            <span>Launch brief</span>
            <strong>{canRun ? 'ready to audit' : 'needs product and budget'}</strong>
          </div>
          <div className="aa-form-grid">
            <Field label="Product">
              <input value={form.product} onChange={(e) => patch({ product: e.target.value })} placeholder="AI Resume Optimizer" />
            </Field>
            <Field label="Budget">
              <input value={form.budget} onChange={(e) => patch({ budget: e.target.value.replace(/[^0-9]/g, '') })} placeholder="500" inputMode="numeric" />
            </Field>
            <Field label="Target CPA">
              <input value={form.targetCpa} onChange={(e) => patch({ targetCpa: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="35" inputMode="decimal" />
            </Field>
            <Field label="AOV">
              <input value={form.aov} onChange={(e) => patch({ aov: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="120" inputMode="decimal" />
            </Field>
            <Field label="Gross margin">
              <input value={form.margin} onChange={(e) => patch({ margin: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0.60" inputMode="decimal" />
            </Field>
            <Field label="Landing page">
              <input value={form.landingPage} onChange={(e) => patch({ landingPage: e.target.value })} placeholder="https://..." />
            </Field>
          </div>
          <Field label="Audience">
            <textarea value={form.audience} onChange={(e) => patch({ audience: e.target.value })} placeholder="US job seekers and career switchers, age 22-45" />
          </Field>
          <Field label="Current claim or hook">
            <textarea value={form.claim} onChange={(e) => patch({ claim: e.target.value })} placeholder="Land a job in 7 days" />
          </Field>
          <label className="aa-upload">
            <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] || undefined)} />
            {form.creativeDataUrl ? <img src={form.creativeDataUrl} alt={form.creativeName || 'Uploaded creative'} /> : <span>Upload ad creative for Gemini vision review</span>}
          </label>
        </div>

        <aside className="aa-brief-card">
          <div className="aa-campaign-title">
            <div>
              <span>Campaign draft</span>
              <h2>{form.product || 'Untitled campaign'}</h2>
            </div>
            <div className={`aa-risk-badge risk-${claimRisk}`}>{claimRisk === 'none' ? 'no claim' : `${claimRisk} risk`}</div>
          </div>
          <BudgetMath form={form} />
          <div className="aa-vitals">
            <Vital label="Completeness" value={form.product && form.budget && form.audience ? 4 : 2} text={form.product && form.budget ? 'brief usable' : 'missing basics'} />
            <Vital label="Policy risk" value={claimRisk === 'high' ? 5 : claimRisk === 'medium' ? 3 : 1} text={claimRisk} risk={claimRisk === 'high'} />
            <Vital label="Budget density" value={budget >= 1000 ? 5 : budget >= 300 ? 3 : 1} text={budget >= 300 ? 'viable' : 'too thin'} />
            <Vital label="Creative input" value={form.creativeDataUrl ? 5 : 1} text={form.creativeDataUrl ? 'vision ready' : 'optional'} />
          </div>
        </aside>
      </section>
    </main>
  )
}

function Vital({ label, value, text, risk }: { label: string; value: number; text: string; risk?: boolean }) {
  return (
    <div className={`aa-vital ${risk ? 'is-risk' : ''}`}>
      <span>{label}</span>
      <div className="aa-pips">{[0, 1, 2, 3, 4].map((i) => <b key={i} className={i < value ? 'on' : ''} />)}</div>
      <strong>{text}</strong>
    </div>
  )
}

function Review({
  form,
  runMode,
  toolCalls,
  evidence,
  browserSession,
  stageLabel,
  streamError,
}: {
  form: IntakeForm
  runMode: RunMode
  toolCalls: ToolCall[]
  evidence: EvidenceItem[]
  browserSession: BrowserSession | null
  stageLabel: string
  streamError: string | null
}) {
  const done = toolCalls.filter((call) => call.status === 'done').length
  const budget = parseBudget(form)

  return (
    <main className="aa-page aa-review">
      <section className="aa-review-head">
        <div>
          <div className="aa-kicker">Live workspace trace</div>
          <h1>Building the safest viable Meta test.</h1>
          <p>{stageLabel}</p>
          <div className={`aa-mode-pill mode-${runMode}`}>
            {runMode === 'live' ? 'LIVE TOOLS ENABLED' : 'DEMO TRACE'}
            <small>{runMode === 'live' ? 'real evidence attempt, fixture fallback marked' : 'fixed trace for video timing'}</small>
          </div>
        </div>
        <div className="aa-review-score">
          <strong>{done}/{toolCalls.length || 9}</strong>
          <span>tools complete</span>
        </div>
      </section>

      <section className="aa-media-strip">
        <Metric label="Product" value={form.product || '-'} detail="Meta lead campaign" />
        <Metric label="Budget split" value={`${getAdSetCount(budget)} ad sets`} detail={`${money(Math.round(budget / getAdSetCount(budget)))} each`} />
        <Metric label="Primary KPI" value="CPA" detail={`target ${money(form.targetCpa || 35)}`} />
        <Metric label="Execution" value="PAUSED" detail="active spend disabled" tone="ready" />
      </section>

      {streamError && <div className="aa-error">{streamError}</div>}

      <section className="aa-review-grid">
        <div className="aa-tool-panel">
          <PanelTitle title="Agent tool calls" meta={`${done}/${toolCalls.length || 9}`} />
          <div className="aa-tool-list">
            {toolCalls.map((call) => <ToolRow key={call.id} call={call} />)}
            {toolCalls.length === 0 && <SkeletonRows />}
          </div>
        </div>
        <div className="aa-evidence-panel">
          <PanelTitle title="Evidence arriving" meta={`${evidence.length} sources`} />
          <EvidenceList items={evidence} />
        </div>
      </section>

      {browserSession && <BrowserCameo session={browserSession} />}
    </main>
  )
}

function PanelTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="aa-panel-title">
      <span>{title}</span>
      {meta && <strong>{meta}</strong>}
    </div>
  )
}

function ToolRow({ call }: { call: ToolCall }) {
  const label = TOOL_LABEL[call.tool] || call.tool
  const meta = [
    call.duration_ms ? `${call.duration_ms}ms` : '',
    call.http_status ? String(call.http_status) : '',
  ].filter(Boolean).join(' / ')

  return (
    <details className={`aa-tool-row is-${call.status}`}>
      <summary>
        <span className="aa-tool-dot" />
        <strong>{label}</strong>
        <em>{call.summary}</em>
        <small>{meta || call.tool}</small>
      </summary>
      <pre>{JSON.stringify({ tool: call.tool, input: call.input, output: call.output }, null, 2)}</pre>
    </details>
  )
}

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return <SkeletonRows />
  return (
    <div className="aa-evidence-list">
      {items.map((item) => (
        <article key={item.id} className={`aa-evidence source-${item.source_type}`}>
          <span>{SOURCE_LABEL[item.source_type] || item.source_type}</span>
          <strong>{item.finding}</strong>
          {item.impact && <p>{item.impact}</p>}
        </article>
      ))}
    </div>
  )
}

function BrowserCameo({ session }: { session: BrowserSession }) {
  return (
    <aside className="aa-browser-cameo">
      <div className="aa-browser-top">
        <span /><span /><span />
        <strong>{session.url}</strong>
      </div>
      <div className="aa-browser-body">
        {session.screenshot_url ? <img src={session.screenshot_url} alt={session.title || 'Browser evidence'} /> : (
          <>
            <small>{session.title || 'Evidence page'}</small>
            <p>{session.highlighted_text || 'Reading visible page claims and landing-page proof.'}</p>
          </>
        )}
      </div>
    </aside>
  )
}

function Verdict({
  form,
  workspace,
  executeResult,
  executing,
  onExecute,
  onReset,
}: {
  form: IntakeForm
  workspace: WorkspaceResult | null
  executeResult: ExecuteResult | null
  executing: boolean
  onExecute: () => void
  onReset: () => void
}) {
  const decision = workspace?.final_decision?.status || 'READY_PAUSED'
  const checks = workspace?.causal_checks || []
  const passed = checks.filter((check) => check.passed !== false).length
  const adSets = workspace?.recommended_plan?.ad_sets || []
  const scenarios = workspace?.scenarios || []
  const diff = planDiffItems(workspace)
  const campaign = workspace?.paused_execution_spec?.campaign
  const overlay = workspace?.gemini_overlay?.lines

  return (
    <main className="aa-page aa-verdict">
      <section className={`aa-verdict-hero decision-${decision.toLowerCase()}`}>
        <div>
          <div className="aa-kicker">Final buying decision</div>
          <h1>{decision === 'READY_PAUSED' ? 'Ready, but paused.' : decision}</h1>
          <p>{workspace?.final_decision?.summary || 'AdAudit prepared a guarded launch plan without enabling spend.'}</p>
        </div>
        <div className="aa-decision-tile">
          <span>Guardrails</span>
          <strong>{passed}/{checks.length || 6}</strong>
          <small>programmatic checks passed</small>
        </div>
      </section>

      <section className="aa-media-strip">
        <Metric label="AI source" value={workspace?.provenance?.source || 'vertex-ai'} detail={workspace?.provenance?.fallback ? 'fallback used' : 'live overlay'} />
        <Metric label="Evidence" value={workspace?.provenance?.evidence_mode || 'fixture'} detail="stable demo mode" />
        <Metric label="Objective" value={asText(workspace?.recommended_plan?.objective || campaign?.objective, 'LEADS')} detail="pixel-safe fallback" />
        <Metric label="Execution" value="PAUSED" detail="no active spend path" tone="ready" />
      </section>

      <section className="aa-verdict-grid">
        <div className="aa-main-stack">
          <PanelTitle title="Scenario selection" meta={`${scenarios.length || 3} plans compared`} />
          <div className="aa-scenario-grid">
            {scenarios.map((scenario) => <ScenarioCard key={String(scenario.id)} scenario={scenario} selected={scenario.id === workspace?.recommended_plan?.scenario_id} />)}
          </div>

          <PanelTitle title="Before / after repair" meta="why the plan changed" />
          <div className="aa-diff-grid">
            {diff.map((item, index) => (
              <article key={index} className="aa-diff">
                <span>{asText(item.field || item.id || `Change ${index + 1}`)}</span>
                <div><small>Before</small><p>{asText(item.before)}</p></div>
                <div><small>After</small><p>{asText(item.after)}</p></div>
              </article>
            ))}
            {!diff.length && <article className="aa-diff"><span>Claim rewrite</span><div><small>Before</small><p>{form.claim || 'No claim'}</p></div><div><small>After</small><p>Proof-based resume diagnosis, no outcome guarantee.</p></div></article>}
          </div>

          <PanelTitle title="Recommended media plan" meta={workspace?.recommended_plan?.campaign_name || 'Meta draft'} />
          <div className="aa-adset-table">
            {adSets.map((adSet, index) => (
              <div key={index} className="aa-adset-row">
                <strong>{asText(adSet.name, `Ad set ${index + 1}`)}</strong>
                <span>{asText(adSet.audience)}</span>
                <em>{money(asText(adSet.budget_usd, '0'))}</em>
                <small>{asText(adSet.optimization_goal || adSet.creative_hypothesis)}</small>
              </div>
            ))}
          </div>
        </div>

        <aside className="aa-side-stack">
          <PanelTitle title="Causal guardrails" meta={`${passed}/${checks.length || 6} pass`} />
          <div className="aa-check-list">
            {checks.map((check, index) => (
              <div key={String(check.id || index)} className={`aa-check ${check.passed === false ? 'fail' : 'pass'}`}>
                <span>{check.passed === false ? 'FAIL' : 'PASS'}</span>
                <strong>{asText(check.id || check.name)}</strong>
                <p>{asText(check.detail || check.reason || check.actual)}</p>
              </div>
            ))}
          </div>

          {overlay && (
            <>
              <PanelTitle title="Gemini overlay" meta="live strategy note" />
              <div className="aa-overlay">
                {Object.entries(overlay).map(([key, value]) => (
                  <p key={key}><strong>{key}</strong>{value}</p>
                ))}
              </div>
            </>
          )}

          <PanelTitle title="Paused launch spec" meta="executor locked" />
          <div className="aa-launch-card">
            <dl>
              <div><dt>Campaign</dt><dd>{asText(campaign?.name || workspace?.recommended_plan?.campaign_name)}</dd></div>
              <div><dt>Status</dt><dd>PAUSED</dd></div>
              <div><dt>Mode</dt><dd>{asText(workspace?.paused_execution_spec?.executor_mode, 'mock')}</dd></div>
            </dl>
            <button className="aa-primary" type="button" onClick={onExecute} disabled={executing || Boolean(executeResult)}>
              {executeResult ? 'Paused campaign prepared' : executing ? 'Preparing...' : 'Create paused campaign'}
            </button>
            {executeResult && (
              <div className="aa-exec-result">
                <strong>Campaign ID {executeResult.campaign_id}</strong>
                <span>Ad sets {executeResult.adset_ids?.join(', ')}</span>
                <small>{executeResult.note}</small>
              </div>
            )}
            <button className="aa-secondary" type="button" onClick={onReset}>Run another brief</button>
          </div>
        </aside>
      </section>
    </main>
  )
}

function ScenarioCard({ scenario, selected }: { scenario: Record<string, unknown>; selected: boolean }) {
  return (
    <article className={`aa-scenario ${selected ? 'selected' : ''}`}>
      <span>{selected ? 'Selected' : asText(scenario.id)}</span>
      <h3>{asText(scenario.name)}</h3>
      <p>{asText(scenario.structure)}</p>
      <dl>
        <div><dt>Objective</dt><dd>{asText(scenario.objective)}</dd></div>
        <div><dt>Budget</dt><dd>{money(asText(scenario.budget_usd, '0'))}</dd></div>
        <div><dt>Signal</dt><dd>{asText(scenario.expected_signal)}</dd></div>
      </dl>
    </article>
  )
}

function SkeletonRows() {
  return (
    <div className="aa-skeleton">
      <span /><span /><span />
    </div>
  )
}

function App() {
  const [act, setAct] = useState<Act>('intake')
  const [form, setForm] = useState<IntakeForm>(SAMPLE_FORM)
  const [runMode, setRunMode] = useState<RunMode>('demo')
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [browserSession, setBrowserSession] = useState<BrowserSession | null>(null)
  const [stageLabel, setStageLabel] = useState('Idle')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceResult | null>(null)
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null)
  const [executing, setExecuting] = useState(false)
  const currentRun = useRef(0)

  const intakePayload = useMemo(() => ({
    product: form.product,
    budget_usd: parseBudget(form),
    audience: form.audience,
    claim: form.claim,
    landing_page: form.landingPage,
    product_url: /^https?:\/\//i.test(form.landingPage.trim()) ? form.landingPage.trim() : undefined,
    assets: form.claim,
    creative_name: form.creativeName,
    target_cpa: Number(form.targetCpa || 0) || undefined,
    aov: Number(form.aov || 0) || undefined,
    gross_margin: Number(form.margin || 0) || undefined,
  }), [form])

  const runAudit = () => {
    currentRun.current += 1
    setAct('reviewing')
    setToolCalls([])
    setEvidence([])
    setBrowserSession(null)
    setWorkspace(null)
    setExecuteResult(null)
    setStreamError(null)
    setStageLabel('Booting media buyer workspace')
  }

  useEffect(() => {
    if (act !== 'reviewing') return
    const runId = currentRun.current
    const ctrl = new AbortController()

    streamWorkspace(intakePayload, runMode, ctrl.signal, {
      onStageStart: ({ label, stage_id }) => setStageLabel(label || stage_id || 'Working'),
      onToolStart: (call) => setToolCalls((prev) => [...prev, call]),
      onToolDone: (id, patch) => setToolCalls((prev) => prev.map((call) => call.id === id ? { ...call, ...patch } : call)),
      onToolError: (id, error) => setToolCalls((prev) => prev.map((call) => call.id === id ? { ...call, status: 'error', summary: `${call.summary} - ${error}` } : call)),
      onBrowserOpen: (session) => setBrowserSession(session),
      onBrowserClose: () => setBrowserSession(null),
      onEvidence: (item) => setEvidence((prev) => [...prev, item]),
      onWorkspaceDone: (result) => {
        if (runId !== currentRun.current) return
        setWorkspace(result)
        setStageLabel('Verdict ready')
        window.setTimeout(() => {
          if (runId === currentRun.current) setAct('verdict')
        }, 700)
      },
      onError: (message) => setStreamError(message),
    }).catch((err) => {
      if ((err as Error).name !== 'AbortError') setStreamError((err as Error).message)
    })

    return () => ctrl.abort()
  }, [act, intakePayload, runMode])

  const executePaused = async () => {
    setExecuting(true)
    try {
      const res = await fetch('/api/campaign/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED', workspace_id: workspace?.provenance?.request_id }),
      })
      setExecuteResult(await res.json())
    } finally {
      setExecuting(false)
    }
  }

  const reset = () => {
    currentRun.current += 1
    setAct('intake')
    setWorkspace(null)
    setToolCalls([])
    setEvidence([])
    setExecuteResult(null)
    setStreamError(null)
  }

  return (
    <div className="aa-shell">
      <Masthead act={act} workspace={workspace} />
      {act === 'intake' && <Intake form={form} setForm={setForm} runMode={runMode} setRunMode={setRunMode} onRun={runAudit} />}
      {act === 'reviewing' && (
        <Review
          form={form}
          runMode={runMode}
          toolCalls={toolCalls}
          evidence={evidence}
          browserSession={browserSession}
          stageLabel={stageLabel}
          streamError={streamError}
        />
      )}
      {act === 'verdict' && (
        <Verdict
          form={form}
          workspace={workspace}
          executeResult={executeResult}
          executing={executing}
          onExecute={executePaused}
          onReset={reset}
        />
      )}
    </div>
  )
}

export default App
