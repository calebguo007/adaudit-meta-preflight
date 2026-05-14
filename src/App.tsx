import { motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import './App.css'

type Intake = {
  product: string
  product_url: string
  landing_page: string
  platform: string
  budget_usd: number
  objective: string
  kpi_priority: string[]
  audience: string
  assets: string
  competitors: string
  constraints: string
  pixel_status: string
}

type Evidence = { source: string; finding: string; impact: string }
type Hypothesis = { name: string; hook: string; emotion: string; proof: string; risk: string; success_metric: string }
type Scenario = {
  id: string
  name: string
  objective: string
  budget_usd: number
  structure: string
  expected_signal: string
  kpi_ranges: Record<string, string>
  risk: string
  verdict: string
  reason: string
}
type AdSet = { name: string; audience: string; budget_usd: number; creative_hypothesis: string; optimization_goal: string }
type AuditorReview = { auditor: string; status: 'pass' | 'warn' | 'fail'; finding: string; mitigation: string }
type Workspace = {
  intake_summary: {
    product: string
    platform: string
    budget_usd: number
    objective: string
    kpi_priority: string[]
    audience: string
    constraints: string[]
  }
  evidence: Evidence[]
  creative_hypotheses: Hypothesis[]
  scenarios: Scenario[]
  recommended_plan: {
    scenario_id: string
    why_this_wins: string[]
    why_others_lose: string[]
    campaign_name: string
    ad_sets: AdSet[]
  }
  auditor_reviews: AuditorReview[]
  final_decision: { status: 'HOLD' | 'FIX_FIRST' | 'READY_PAUSED'; summary: string; human_approval_required: boolean }
  paused_execution_spec: {
    status: string
    executor_mode: string
    campaign: { name: string; objective: string; status: string }
    safety_notes: string[]
  }
}
type ExecutorResult = { executor_mode: string; status: string; campaign_id: string; adset_ids: string[]; ad_ids: string[]; note: string }
type AiInfo = { baseUrl?: string; model?: string; hasKey?: boolean }

const defaultIntake: Intake = {
  product: 'AI Resume Optimizer',
  product_url: 'https://example.com/resume-ai',
  landing_page: 'Hero promises resume clarity and ATS readiness. CTA is "Get my resume audit". No job guarantee on the page.',
  platform: 'Meta',
  budget_usd: 500,
  objective: 'Lead generation',
  kpi_priority: ['CPA', 'CTR', 'CPC'],
  audience: 'US early-career job seekers and career switchers, age 22-45',
  assets: 'Static resume before/after mockup, proof-first copy, one risky draft saying "land a job in 7 days".',
  competitors: 'Teal, Rezi, Kickresume, Resume Worded',
  constraints: 'No automatic spend. Avoid guaranteed employment outcomes. Keep first flight under $500.',
  pixel_status: 'unknown',
}

function providerName(baseUrl?: string) {
  if (!baseUrl) return 'AI provider'
  if (baseUrl.includes('vultrinference')) return 'Vultr Serverless Inference'
  if (baseUrl.includes('tokendance')) return 'DeepSeek gateway'
  if (baseUrl.includes('openai')) return 'OpenAI'
  try { return new URL(baseUrl).hostname } catch { return 'AI provider' }
}

function statusClass(status?: string) {
  if (status === 'pass' || status === 'READY_PAUSED' || status === 'recommended' || status === 'low') return 'good'
  if (status === 'warn' || status === 'FIX_FIRST' || status === 'viable' || status === 'medium') return 'warn'
  if (status === 'fail' || status === 'HOLD' || status === 'not_recommended' || status === 'high') return 'bad'
  return 'neutral'
}

function formatStatus(status?: string) {
  if (!status) return ''
  return status.replace(/_/g, ' ').toUpperCase()
}

function compactStatus(status?: string) {
  if (status === 'not_recommended') return 'NOT REC.'
  if (status === 'recommended') return 'RECOMMENDED'
  return formatStatus(status)
}

function money(n?: number) {
  return typeof n === 'number' ? `$${n.toLocaleString()}` : '-'
}

function App() {
  const [intake, setIntake] = useState<Intake>(defaultIntake)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [executor, setExecutor] = useState<ExecutorResult | null>(null)
  const [ai, setAi] = useState<AiInfo>({})
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')
  const [analysisMode, setAnalysisMode] = useState<'live' | 'demo' | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setAi(data.ai || {}))
      .catch(() => setAi({}))
  }, [])

  const recommended = useMemo(
    () => workspace?.scenarios.find((s) => s.id === workspace.recommended_plan.scenario_id),
    [workspace],
  )

  async function analyze(demoMode = false) {
    setLoading(true)
    setError('')
    setExecutor(null)
    try {
      const res = await fetch('/api/workspace/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...intake, demo_mode: demoMode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setWorkspace(data.workspace)
      setAnalysisMode(demoMode ? 'demo' : 'live')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  async function executePaused() {
    if (!workspace) return
    setExecuting(true)
    setError('')
    try {
      const res = await fetch('/api/campaign/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED', plan: workspace.paused_execution_spec }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Execution failed')
      setExecutor(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setExecuting(false)
    }
  }

  function patch<K extends keyof Intake>(key: K, value: Intake[K]) {
    setIntake((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-rail">
        <div className="brand-lockup">
          <div className="brand-mark">AA</div>
          <div>
            <strong>AdAudit</strong>
            <span>Guarded media buyer</span>
          </div>
        </div>

        <nav className="rail-steps" aria-label="Workflow">
          {['Intake', 'Research', 'Simulation', 'Guardrails', 'Paused Spec'].map((step, index) => (
            <span className={workspace || index === 0 ? 'active' : ''} key={step}>
              <em>{String(index + 1).padStart(2, '0')}</em>
              {step}
            </span>
          ))}
        </nav>

        <div className="rail-note">
          <strong>Safety model</strong>
          <p>Read and simulation are safe. Execution is dry-run shaped and always creates PAUSED objects only.</p>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-hero">
          <div>
            <p className="eyebrow">ADAUDIT / MEDIA BUYING WORKSPACE / V0.3</p>
            <h1>Simulate the media buy before the agent spends.</h1>
            <p className="hero-copy">
              Enter product, assets, budget, audience, and KPI priorities. AdAudit researches the evidence, compares
              three campaign options, recommends the cheapest viable Meta test, then audits the plan before paused execution.
            </p>
          </div>
          <div className="provider-card">
            <span>POWERED BY</span>
            <strong>{providerName(ai.baseUrl)}</strong>
            <small>{ai.model || 'model pending'}</small>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <section className="workspace-grid">
          <motion.form
            className="panel intake-panel"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={(e) => { e.preventDefault(); void analyze() }}
          >
            <PanelTitle label="Campaign Intake" detail="The real user entry point" />

            <Field label="Product">
              <input value={intake.product} onChange={(e) => patch('product', e.target.value)} />
            </Field>
            <Field label="Product URL">
              <input value={intake.product_url} onChange={(e) => patch('product_url', e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Platform">
                <select value={intake.platform} onChange={(e) => patch('platform', e.target.value)}>
                  <option>Meta</option>
                  <option disabled>Google - next</option>
                  <option disabled>TikTok - next</option>
                </select>
              </Field>
              <Field label="Budget">
                <input
                  type="number"
                  min={100}
                  value={intake.budget_usd}
                  onChange={(e) => patch('budget_usd', Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Objective">
                <select value={intake.objective} onChange={(e) => patch('objective', e.target.value)}>
                  <option>Lead generation</option>
                  <option>Traffic</option>
                  <option>Purchases</option>
                  <option>Demos</option>
                  <option>Awareness</option>
                </select>
              </Field>
              <Field label="Pixel status">
                <select value={intake.pixel_status} onChange={(e) => patch('pixel_status', e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="missing">Missing</option>
                  <option value="verified">Verified</option>
                </select>
              </Field>
            </div>
            <Field label="KPI priority">
              <input
                value={intake.kpi_priority.join(', ')}
                onChange={(e) => patch('kpi_priority', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
              />
            </Field>
            <Field label="Audience">
              <textarea value={intake.audience} onChange={(e) => patch('audience', e.target.value)} rows={3} />
            </Field>
            <Field label="Landing page evidence">
              <textarea value={intake.landing_page} onChange={(e) => patch('landing_page', e.target.value)} rows={3} />
            </Field>
            <Field label="Assets and copy">
              <textarea value={intake.assets} onChange={(e) => patch('assets', e.target.value)} rows={3} />
            </Field>
            <Field label="Competitors">
              <input value={intake.competitors} onChange={(e) => patch('competitors', e.target.value)} />
            </Field>
            <Field label="Constraints">
              <textarea value={intake.constraints} onChange={(e) => patch('constraints', e.target.value)} rows={3} />
            </Field>

            <div className="action-row">
              <button className="primary-action" disabled={loading} type="submit">
                {loading ? 'Simulating media buy...' : 'Build with live AI'}
              </button>
              <button className="ghost-action" disabled={loading} onClick={() => void analyze(true)} type="button">
                Instant demo
              </button>
            </div>
          </motion.form>

          <section className="workspace-results">
            <div className="decision-strip">
              <div>
                <span>FINAL RECOMMENDATION</span>
                <strong className={statusClass(workspace?.final_decision.status)}>
                  {formatStatus(workspace?.final_decision.status) || 'WAITING FOR INTAKE'}
                </strong>
                {analysisMode && <small>{analysisMode === 'live' ? 'Live AI analysis' : 'Instant playbook demo'}</small>}
              </div>
              <p>{workspace?.final_decision.summary || 'Run the workspace to compare campaign options and produce a paused execution spec.'}</p>
            </div>

            <div className="result-grid three">
              {(workspace?.scenarios || placeholderScenarios).map((scenario) => (
                <ScenarioCard scenario={scenario} key={scenario.id} active={scenario.id === workspace?.recommended_plan.scenario_id} />
              ))}
            </div>

            <div className="result-grid two">
              <section className="panel">
                <PanelTitle label="Evidence Board" detail="What the agents used" />
                <div className="stack">
                  {(workspace?.evidence || placeholderEvidence).map((item, index) => (
                    <article className="evidence-card" key={`${item.source}-${index}`}>
                      <span>{item.source}</span>
                      <strong>{item.finding}</strong>
                      <p>{item.impact}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel">
                <PanelTitle label="Creative Hypotheses" detail="Testable angles, not final assets" />
                <div className="stack">
                  {(workspace?.creative_hypotheses || placeholderHypotheses).map((item) => (
                    <article className="hypothesis-card" key={item.name}>
                      <div>
                        <strong>{item.name}</strong>
                        <span className={statusClass(item.risk)}>{item.risk}</span>
                      </div>
                      <p>{item.hook}</p>
                      <small>{item.proof} / {item.success_metric}</small>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel recommendation-panel">
              <PanelTitle label="Best Plan" detail={recommended ? recommended.name : 'No recommendation yet'} />
              <div className="recommendation-grid">
                <div>
                  <h2>{workspace?.recommended_plan.campaign_name || 'Run analysis to generate a campaign spec'}</h2>
                  <ul>
                    {(workspace?.recommended_plan.why_this_wins || ['The recommended plan will explain why it is the cheapest viable test.']).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="adset-list">
                  {(workspace?.recommended_plan.ad_sets || []).map((adSet) => (
                    <article key={adSet.name}>
                      <strong>{adSet.name}</strong>
                      <span>{money(adSet.budget_usd)} / {adSet.optimization_goal}</span>
                      <p>{adSet.audience}</p>
                      <small>{adSet.creative_hypothesis}</small>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <div className="result-grid two">
              <section className="panel">
                <PanelTitle label="Guardrail Review" detail="Five specialist checks" />
                <div className="auditor-grid">
                  {(workspace?.auditor_reviews || placeholderAuditors).map((review) => (
                    <article className={`auditor-card ${statusClass(review.status)}`} key={review.auditor}>
                      <span>{review.auditor}</span>
                      <strong>{review.finding}</strong>
                      <p>{review.mitigation}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel executor-panel">
                <PanelTitle label="Paused Execution" detail="Dry-run shaped Meta output" />
                <code>campaign.name = {workspace?.paused_execution_spec.campaign.name || '<pending>'}</code>
                <code>campaign.objective = {workspace?.paused_execution_spec.campaign.objective || '<pending>'}</code>
                <code>campaign.status = PAUSED</code>
                <button
                  className="secondary-action"
                  disabled={!workspace || executing}
                  onClick={() => void executePaused()}
                  type="button"
                >
                  {executing ? 'Creating paused objects...' : 'Create paused campaign objects'}
                </button>
                {executor && (
                  <div className="executor-output">
                    <strong>campaign_id={executor.campaign_id}</strong>
                    {executor.adset_ids.map((id) => <span key={id}>adset_id={id}</span>)}
                    {executor.ad_ids.map((id) => <span key={id}>ad_id={id}</span>)}
                    <em>status={executor.status}</em>
                  </div>
                )}
                <p>
                  {workspace?.paused_execution_spec.safety_notes?.join(' ') ||
                    'Execution stays disabled until a plan has been simulated and reviewed.'}
                </p>
              </section>
            </div>
          </section>
        </section>
      </section>
    </main>
  )
}

function PanelTitle({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="panel-title">
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function ScenarioCard({ scenario, active }: { scenario: Scenario; active?: boolean }) {
  return (
    <article className={`scenario-card ${statusClass(scenario.verdict)} ${active ? 'selected' : ''}`}>
      <div>
        <span>{scenario.id}</span>
        <em>{compactStatus(scenario.verdict)}</em>
      </div>
      <h3>{scenario.name}</h3>
      <strong>{money(scenario.budget_usd)} / {scenario.objective}</strong>
      <p>{scenario.structure}</p>
      <small>{scenario.expected_signal}</small>
      <dl>
        {Object.entries(scenario.kpi_ranges || {}).map(([key, value]) => (
          <div key={key}>
            <dt>{key.toUpperCase()}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="scenario-reason">{scenario.reason}</p>
    </article>
  )
}

const placeholderScenarios: Scenario[] = [
  {
    id: 'validation',
    name: 'Cheap validation test',
    objective: 'TRAFFIC',
    budget_usd: 0,
    structure: 'Waiting for intake.',
    expected_signal: 'Run analysis to estimate signal.',
    kpi_ranges: { cpm: '-', ctr: '-', cpc: '-', cpa: '-' },
    risk: 'low',
    verdict: 'pending',
    reason: 'No simulation has run yet.',
  },
  {
    id: 'balanced',
    name: 'Balanced learning test',
    objective: 'LEADS',
    budget_usd: 0,
    structure: 'Waiting for intake.',
    expected_signal: 'Run analysis to estimate signal.',
    kpi_ranges: { cpm: '-', ctr: '-', cpc: '-', cpa: '-' },
    risk: 'medium',
    verdict: 'pending',
    reason: 'No simulation has run yet.',
  },
  {
    id: 'aggressive',
    name: 'Aggressive conversion test',
    objective: 'CONVERSIONS',
    budget_usd: 0,
    structure: 'Waiting for intake.',
    expected_signal: 'Run analysis to estimate signal.',
    kpi_ranges: { cpm: '-', ctr: '-', cpc: '-', cpa: '-' },
    risk: 'high',
    verdict: 'pending',
    reason: 'No simulation has run yet.',
  },
]

const placeholderEvidence: Evidence[] = [
  { source: 'product', finding: 'No workspace analysis yet.', impact: 'The agent needs product, budget, audience, and asset context.' },
]

const placeholderHypotheses: Hypothesis[] = [
  { name: 'Awaiting research', hook: 'Creative hypotheses appear after analysis.', emotion: '-', proof: '-', risk: 'neutral', success_metric: '-' },
]

const placeholderAuditors: AuditorReview[] = [
  { auditor: 'TrackingAuditor', status: 'warn', finding: 'Awaiting plan.', mitigation: 'Run analysis first.' },
  { auditor: 'AudienceAuditor', status: 'warn', finding: 'Awaiting plan.', mitigation: 'Run analysis first.' },
  { auditor: 'BudgetAuditor', status: 'warn', finding: 'Awaiting plan.', mitigation: 'Run analysis first.' },
  { auditor: 'PolicyAuditor', status: 'warn', finding: 'Awaiting plan.', mitigation: 'Run analysis first.' },
  { auditor: 'CreativeLandingAuditor', status: 'warn', finding: 'Awaiting plan.', mitigation: 'Run analysis first.' },
]

export default App
