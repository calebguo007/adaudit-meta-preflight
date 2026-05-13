import { useMemo, useState } from 'react'
import './App.css'

type StepId = 'brief' | 'evidence' | 'audit' | 'launch'
type AuditStatus = 'pass' | 'warn' | 'fail'
type Decision = 'HOLD' | 'FIX_FIRST' | 'READY_PAUSED'

type Auditor = {
  id: string
  name: string
  status: AuditStatus
  headline: string
  detail: string
  metric: string
}

type Hypothesis = {
  id: string
  hook: string
  audience: string
  format: string
  risk: string
}

const steps: Array<{ id: StepId; label: string; detail: string }> = [
  { id: 'brief', label: 'Brief', detail: 'Campaign intent' },
  { id: 'evidence', label: 'Evidence', detail: 'Gemini + Ad Library' },
  { id: 'audit', label: 'Audit Board', detail: '5 auditor agents' },
  { id: 'launch', label: 'Paused Launch', detail: 'Meta executor' },
]

const badBrief =
  'Launch a $500 Meta test for my AI resume optimizer targeting US job seekers. Promise they can land a job in 7 days.'

const fixedBrief =
  'Launch a $500 paused Meta lead test for an AI resume optimizer. Target US job seekers and early-career founders with proof-first hooks and no guaranteed employment outcome claims.'

const initialAuditors: Auditor[] = [
  {
    id: 'pixel',
    name: 'PixelAuditor',
    status: 'fail',
    headline: 'No conversion signal ready',
    detail:
      'The lead event has not fired in the last 14 days, so a conversion objective would enter learning without reliable feedback.',
    metric: '0 recent lead events',
  },
  {
    id: 'audience',
    name: 'AudienceAuditor',
    status: 'warn',
    headline: 'Audience is too broad and fragmented',
    detail:
      '“US job seekers” is too vague for a three-variant test. Split into two intent-led audiences before launch.',
    metric: '67% overlap risk',
  },
  {
    id: 'policy',
    name: 'PolicyAuditor',
    status: 'fail',
    headline: 'Employment outcome claim is risky',
    detail:
      '“Land a job in 7 days” is a high-risk employment promise and could trigger review or rejection.',
    metric: 'Policy risk 4.2',
  },
  {
    id: 'budget',
    name: 'BudgetAuditor',
    status: 'fail',
    headline: 'Budget cannot support the proposed test',
    detail:
      '$500 split across three conversion variants is unlikely to collect enough signal for a confident decision.',
    metric: '~143 click estimate',
  },
  {
    id: 'creative',
    name: 'CreativeAuditor',
    status: 'warn',
    headline: 'Hook is outside category norm',
    detail:
      'Competitor evidence favors proof-first resume score improvements over guaranteed employment promises.',
    metric: '18 ads compared',
  },
]

const fixedAuditors: Auditor[] = [
  {
    id: 'pixel',
    name: 'PixelAuditor',
    status: 'warn',
    headline: 'Use Leads objective until signal improves',
    detail:
      'The plan switches from conversion optimization to a lead objective while the pixel warms up.',
    metric: 'Safe fallback',
  },
  {
    id: 'audience',
    name: 'AudienceAuditor',
    status: 'pass',
    headline: 'Two focused audiences are ready',
    detail:
      'Audience split is now early-career job seekers and founder/operator job switchers, reducing fragmentation.',
    metric: '2 clean ad sets',
  },
  {
    id: 'policy',
    name: 'PolicyAuditor',
    status: 'pass',
    headline: 'Outcome claim removed',
    detail:
      'Creative now promises resume clarity and ATS readiness, not a guaranteed job outcome.',
    metric: 'Low risk',
  },
  {
    id: 'budget',
    name: 'BudgetAuditor',
    status: 'warn',
    headline: 'Lean test structure approved',
    detail:
      '$500 is now allocated across two hypotheses with hold thresholds instead of three conversion variants.',
    metric: '$250/ad set',
  },
  {
    id: 'creative',
    name: 'CreativeAuditor',
    status: 'pass',
    headline: 'Proof-first creative matched',
    detail:
      'Hooks now mirror active category patterns: score lift, before/after proof, and ATS clarity.',
    metric: '3 variants ready',
  },
]

const evidence = [
  {
    brand: 'ResumeLift',
    hook: 'Before/after ATS score proof',
    note: 'Uses measurable improvement, not job guarantees.',
    tone: 'Proof-first',
  },
  {
    brand: 'CareerPilot',
    hook: 'Avoid the resume black hole',
    note: 'Targets rejection anxiety without promising outcomes.',
    tone: 'Pain-aware',
  },
  {
    brand: 'HireReady',
    hook: 'Know what the robot sees',
    note: 'Positions ATS as the obstacle and the product as the scanner.',
    tone: 'Enemy frame',
  },
]

const hypotheses: Hypothesis[] = [
  {
    id: 'H1',
    hook: 'Raise your ATS score before you apply',
    audience: 'Early-career job seekers',
    format: 'Meta static proof ad',
    risk: 'Low policy risk',
  },
  {
    id: 'H2',
    hook: 'See what resume robots reject',
    audience: 'Founder/operator job switchers',
    format: 'Carousel teardown',
    risk: 'Moderate fatigue risk',
  },
  {
    id: 'H3',
    hook: 'Fix the missing keywords in 5 minutes',
    audience: 'Remote SaaS applicants',
    format: 'UGC script',
    risk: 'Needs softer claim',
  },
]

const commandLines = [
  'meta-ads campaign create --name "AA_2026-05-13_ATS_Lead_Test" --objective LEADS --status PAUSED',
  'meta-ads adset create --campaign-id 23868140291 --budget 25000 --audience early-career-us --status PAUSED',
  'meta-ads ad create --adset-id 23868140292 --creative-id 23868140295 --status PAUSED',
]

function statusLabel(status: AuditStatus) {
  if (status === 'pass') return 'PASS'
  if (status === 'warn') return 'WARN'
  return 'FAIL'
}

function decisionCopy(decision: Decision) {
  if (decision === 'READY_PAUSED') {
    return {
      title: 'READY_PAUSED · Safe to create as paused',
      body: 'The corrected plan can be built in Meta as paused objects. Human approval is still required before spend.',
    }
  }
  return {
    title: 'HOLD · Not safe to launch yet',
    body: 'AdAudit found structural campaign risks. It will not create launch-ready ads until the brief is fixed.',
  }
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v5.4c0 4.6-2.9 7.6-7 9.6-4.1-2-7-5-7-9.6V6l7-3z" />
      <path d="M9.2 12.1l1.8 1.8 4-4" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l9 16H3l9-16z" />
      <path d="M12 9v4.3" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v14H4z" />
      <path d="M7.5 9l2.5 2.5L7.5 14" />
      <path d="M12 15h4.5" />
    </svg>
  )
}

function App() {
  const [activeStep, setActiveStep] = useState<StepId>('audit')
  const [brief, setBrief] = useState(badBrief)
  const [fixed, setFixed] = useState(false)
  const [executed, setExecuted] = useState(false)

  const auditors = fixed ? fixedAuditors : initialAuditors
  const decision: Decision = fixed ? 'READY_PAUSED' : 'HOLD'
  const decisionText = decisionCopy(decision)
  const failCount = auditors.filter((auditor) => auditor.status === 'fail').length
  const warnCount = auditors.filter((auditor) => auditor.status === 'warn').length

  const activeIndex = steps.findIndex((step) => step.id === activeStep)
  const executorMode = useMemo(() => (executed ? 'mock executor · Meta-compatible response' : 'pending'), [executed])

  const runAudit = () => {
    setActiveStep('audit')
    setFixed(false)
    setExecuted(false)
    setBrief(badBrief)
  }

  const applyFix = () => {
    setActiveStep('launch')
    setFixed(true)
    setExecuted(false)
    setBrief(fixedBrief)
  }

  const executePaused = () => {
    setActiveStep('launch')
    setFixed(true)
    setExecuted(true)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="AdAudit navigation">
        <div className="brand">
          <div className="brand-mark">
            <ShieldIcon />
          </div>
          <div>
            <strong>AdAudit</strong>
            <span>Meta preflight lab</span>
          </div>
        </div>

        <nav className="step-list">
          {steps.map((step, index) => (
            <button
              className={`step ${step.id === activeStep ? 'active' : ''} ${index < activeIndex ? 'done' : ''}`}
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <strong>Vultr-ready backend</strong>
          <span>Node API exposes brief parsing, evidence analysis, multi-agent preflight, fixes, and paused execution.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Most AI ad tools help you launch faster. AdAudit tells you when not to launch.</h1>
            <p>
              A collaborative system of auditor agents reviews Meta campaign briefs, blocks unsafe launches, and
              prepares paused campaigns only after the risks are fixed.
            </p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="ghost-button" onClick={runAudit}>
              Run bad brief
            </button>
            <button type="button" className="primary-button" onClick={applyFix}>
              Auto-fix plan
            </button>
          </div>
        </header>

        <section className="brief-strip" aria-label="Current brief">
          <div className="brief-card">
            <span>Current brief</span>
            <p>{brief}</p>
          </div>
          <div className={`decision-card ${decision.toLowerCase()}`}>
            <div className="decision-icon">
              {decision === 'READY_PAUSED' ? <ShieldIcon /> : <WarningIcon />}
            </div>
            <div>
              <strong>{decisionText.title}</strong>
              <span>{decisionText.body}</span>
            </div>
          </div>
        </section>

        <section className="main-grid">
          <div className="audit-board">
            <div className="section-heading">
              <div>
                <h2>Collaborative Preflight Audit</h2>
                <p>Five specialized agents examine the same brief and share findings with the coordinator.</p>
              </div>
              <div className="summary-pills">
                <span className="fail">{failCount} fail</span>
                <span className="warn">{warnCount} warn</span>
                <span>{auditors.length} auditors</span>
              </div>
            </div>

            <div className="auditor-grid">
              {auditors.map((auditor) => (
                <article className={`auditor-card ${auditor.status}`} key={auditor.id}>
                  <div className="auditor-header">
                    <div>
                      <strong>{auditor.name}</strong>
                      <span>{auditor.metric}</span>
                    </div>
                    <em>{statusLabel(auditor.status)}</em>
                  </div>
                  <h3>{auditor.headline}</h3>
                  <p>{auditor.detail}</p>
                </article>
              ))}
            </div>

            <div className="evidence-panel">
              <div className="section-heading compact">
                <div>
                  <h2>Gemini + Ad Library Evidence</h2>
                  <p>Category evidence makes the refusal explainable instead of arbitrary.</p>
                </div>
              </div>
              <div className="evidence-row">
                {evidence.map((item, index) => (
                  <article className="evidence-card" key={item.brand}>
                    <div className={`ad-thumb ad-thumb-${index + 1}`}>
                      <span>{item.brand}</span>
                    </div>
                    <div>
                      <strong>{item.hook}</strong>
                      <span>{item.tone}</span>
                      <p>{item.note}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <aside className="launch-panel">
            <div className="launch-status">
              <span>Campaign plan</span>
              <strong>{fixed ? 'Ready as PAUSED' : 'Held before build'}</strong>
            </div>

            <div className="plan-metrics">
              <div>
                <span>Budget</span>
                <strong>$500</strong>
              </div>
              <div>
                <span>Objective</span>
                <strong>{fixed ? 'Leads' : 'Conversions'}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>PAUSED</strong>
              </div>
            </div>

            <div className="hypothesis-list">
              <h2>Fixed hypotheses</h2>
              {hypotheses.map((hypothesis) => (
                <article key={hypothesis.id}>
                  <span>{hypothesis.id}</span>
                  <div>
                    <strong>{hypothesis.hook}</strong>
                    <p>{hypothesis.audience} · {hypothesis.format}</p>
                    <small>{hypothesis.risk}</small>
                  </div>
                </article>
              ))}
            </div>

            <div className="terminal-box">
              <div className="terminal-title">
                <TerminalIcon />
                <span>Meta executor preview</span>
              </div>
              {commandLines.map((line) => (
                <code key={line}>{line}</code>
              ))}
              {executed && (
                <div className="executor-result">
                  <span>campaign_id=23868140291</span>
                  <span>adset_id=23868140292</span>
                  <span>ad_id=23868140296</span>
                  <strong>status=PAUSED</strong>
                </div>
              )}
            </div>

            <div className="launch-actions">
              <button type="button" className="ghost-button" onClick={applyFix}>
                Repair brief
              </button>
              <button type="button" className="primary-button" disabled={!fixed} onClick={executePaused}>
                Create paused campaign
              </button>
            </div>
            <p className="executor-mode">Executor mode: {executorMode}</p>
          </aside>
        </section>
      </section>
    </main>
  )
}

export default App
