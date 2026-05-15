/* ============================================================================
   AdAudit — Frontend Design Constitution v1.0
   ----------------------------------------------------------------------------
   Aesthetic    : Anthropic restraint + Stripe trust + marketer-friendly clarity.
                  Light theme on warm paper. Reddit Serif italic for verdict.
                  Inter for UI. Geist Mono only for technical accents.
   User journey : Act 1 Intake → Act 2 Reviewing → Act 3 Verdict
                  → Act 4 Revise (optional) → Epilogue (paused launch).
                  State machine on one canvas; no router; surfaces morph.
   Motion       : Only ease cubic-bezier(0.16, 1, 0.3, 1). Only fade + 6-8px
                  translate. No spinners, no bounce, no scale. Stagger 80/150ms.
   Agent feel   : Tool Call Strips (collapsed) + Browser Cameo + Wordmark
                  scan-light + Agent Cursor + Receipt. Premium, never geek.
   Anti-patterns: No dark dashboard. No terminal logs. No tabs. No 5-step
                  sidebar. No pixel art. No emoji. No spinners.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import './App.css'

// ---------- types (will grow phase by phase) ----------

type Act = 'intake' | 'reviewing' | 'verdict' | 'revising' | 'done'

type IntakeForm = {
  product: string
  budget: string
  audience: string
  claim: string
  creativeDataUrl?: string
  creativeName?: string
}

const EMPTY_FORM: IntakeForm = {
  product: '',
  budget: '',
  audience: '',
  claim: '',
}

const SAMPLE_FORM: IntakeForm = {
  product: 'AI Resume Optimizer',
  budget: '500',
  audience: 'US job seekers',
  claim: 'Land a job in 7 days',
}

// ---------- masthead (document-style top strip) ----------

function specId() {
  // stable ID format like a real spec sheet: AA-YYYY-MM-DD-XXX
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const tail = String((d.getHours() * 60 + d.getMinutes()) % 999).padStart(3, '0')
  return `AA-${y}-${m}-${day}-${tail}`
}

function PauseSigil({ working }: { working: boolean }) {
  // The pause sigil — two thin vertical bars echoing the PAUSED-by-default
  // safety boundary that defines the entire product.
  return (
    <span className={`pause-sigil ${working ? 'is-working' : ''}`} aria-hidden="true">
      <span className="bar" />
      <span className="bar" />
    </span>
  )
}

function Masthead({ working, specStatus }: { working: boolean; specStatus: string }) {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return (
    <header className="masthead">
      <div className="masthead-rows">
        <div className="masthead-row">
          <div className="wordmark">
            <PauseSigil working={working} />
            <span>AdAudit</span>
            <span className="wordmark-tag">Guarded media buyer</span>
          </div>
          <div className="spec-id">
            Spec <strong>#{specId()}</strong>
          </div>
        </div>
        <div className={`masthead-row meta ${working ? 'is-working' : ''}`}>
          <span>Issued by AdAudit · gemini 2.5-flash</span>
          <span>Status: <strong style={{ color: 'var(--ink)' }}>{specStatus}</strong></span>
          <span className="pulse-row">
            <span className="pulse" aria-hidden="true" />
            <span>{working ? 'Reviewing' : 'Ready'} · {hh}:{mm} UTC</span>
          </span>
        </div>
      </div>
    </header>
  )
}

// ---------- Act 1 — Intake ----------

const AUDIENCE_CHIPS = [
  'US job seekers',
  'Early-career professionals',
  'Career switchers',
  'SaaS founders',
  'Remote workers',
]

function Field({
  num,
  label,
  delay,
  children,
}: {
  num: string
  label: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <div className="field" style={{ animationDelay: `${delay}ms` }}>
      <div className="field-section">
        <span className="sigil">§</span> {num}
      </div>
      <div className="field-body">
        <div className="field-label">{label}</div>
        {children}
      </div>
    </div>
  )
}

// ---------- BudgetHint — agent's first words: live math under the budget field ----------

function BudgetHint({ budget }: { budget: string }) {
  const n = parseInt(budget || '0', 10) || 0
  if (n < 50) return null
  const clicksLow = Math.round(n / 3.0)
  const clicksHigh = Math.round(n / 1.5)
  const adSets = n >= 1000 ? 3 : n >= 300 ? 2 : 1
  const perSet = Math.round(n / adSets)

  return (
    <div className="field-hint" aria-live="polite">
      <span className="hint-approx">≈</span>
      <span>
        <strong>{clicksLow}–{clicksHigh}</strong> clicks @ $1.50–3.00 CPC
      </span>
      <span className="hint-sep">·</span>
      <span className="hint-reco">
        recommends <strong>{adSets} ad set{adSets > 1 ? 's' : ''}</strong> (${perSet} each)
      </span>
    </div>
  )
}

// ---------- BriefPreview — the live memorandum on the right ----------

function PreviewSection({
  num,
  label,
  value,
  placeholder = '—',
}: {
  num: string
  label: string
  value?: string
  placeholder?: string
}) {
  const filled = (value || '').trim().length > 0
  return (
    <div className={`preview-section ${filled ? 'is-filled' : ''}`}>
      <div className="preview-section-head">
        <span className="num">§ {num}</span>
        <span className="label">{label}</span>
      </div>
      <div className="preview-section-value">
        {filled ? value : <span className="placeholder">{placeholder}</span>}
      </div>
    </div>
  )
}

function BriefPreview({ form }: { form: IntakeForm }) {
  // Operational metrics, not literary prose. Marketers see structure + risk + readiness.
  const sectionsComplete = [
    form.product,
    form.budget,
    form.audience,
    form.claim,
    form.creativeDataUrl,
  ].filter((v) => (v || '').toString().trim().length > 0).length

  const budgetNum = parseInt(form.budget || '0', 10) || 0
  const adSetCount = budgetNum >= 1000 ? 3 : budgetNum >= 300 ? 2 : 1
  const budgetPerSet = adSetCount > 0 ? Math.round(budgetNum / adSetCount) : 0

  const claimLower = (form.claim || '').toLowerCase()
  const claimRisk =
    !claimLower
      ? 'low'
      : /\d+\s*(day|week|hour)|guarantee|land a job|get hired|in \d+|lose \d+/i.test(claimLower)
        ? 'high'
        : /promise|outcome|win|best|number one/i.test(claimLower)
          ? 'medium'
          : 'low'

  return (
    <aside className="brief-preview" aria-label="Live campaign brief preview">
      <div className="brief-preview-eyebrow">
        <span>BRIEF · DRAFT</span>
        <span className="rule" aria-hidden="true" />
        <span>{sectionsComplete} / 5</span>
      </div>

      <dl className="brief-preview-meta">
        <div><dt>Platform</dt><dd>Meta · Lead objective</dd></div>
        <div><dt>Spend</dt><dd>{budgetNum > 0 ? `$${budgetNum} USD` : '—'}</dd></div>
        <div><dt>Ad sets</dt><dd>{budgetNum > 0 ? `${adSetCount} (${budgetPerSet}/set)` : '—'}</dd></div>
        <div><dt>Status</dt><dd>Draft · paused-by-default</dd></div>
      </dl>

      <div className="brief-preview-rule" />

      <div className="brief-preview-body">
        <PreviewSection num="1.1" label="Product" value={form.product} />
        <PreviewSection
          num="1.2"
          label="Budget"
          value={form.budget ? `$${form.budget} USD · Meta` : ''}
        />
        <PreviewSection num="1.3" label="Audience" value={form.audience} />
        <PreviewSection
          num="1.4"
          label="Risky claim"
          value={form.claim}
          placeholder="None disclosed"
        />
        <PreviewSection
          num="1.5"
          label="Creative attachment"
          value={form.creativeDataUrl ? (form.creativeName || 'image attached') : ''}
          placeholder="No creative attached"
        />
      </div>

      {/* Vital signs band — mini bar chart language, ad-pro recognizable */}
      <div className="vital-signs">
        <div className="vital-signs-head">
          <span>CAMPAIGN HEALTH</span>
          <span className="rule" aria-hidden="true" />
        </div>
        <VitalSign
          label="Completeness"
          tone="signature"
          filled={sectionsComplete}
          value={`${sectionsComplete} / 5`}
        />
        <VitalSign
          label="Claim risk"
          tone={claimRisk}
          filled={claimRisk === 'high' ? 5 : claimRisk === 'medium' ? 3 : 1}
          value={claimRisk.toUpperCase()}
        />
        <VitalSign
          label="Budget signal"
          tone="signature"
          filled={budgetNum >= 1000 ? 5 : budgetNum >= 500 ? 3 : budgetNum >= 100 ? 1 : 0}
          value={
            budgetNum === 0
              ? '—'
              : budgetNum >= 1000
                ? 'STRONG'
                : budgetNum >= 500
                  ? 'VIABLE'
                  : 'THIN'
          }
        />
        <VitalSign
          label="Vision review"
          tone={form.creativeDataUrl ? 'ready' : 'idle'}
          filled={form.creativeDataUrl ? 5 : 0}
          value={form.creativeDataUrl ? 'READY' : 'NO CREATIVE'}
        />
      </div>
    </aside>
  )
}

type VitalTone = 'signature' | 'low' | 'medium' | 'high' | 'ready' | 'idle'

function VitalSign({
  label,
  tone,
  filled,
  value,
}: {
  label: string
  tone: VitalTone
  filled: number
  value: string
}) {
  return (
    <div className={`vital-row tone-${tone}`}>
      <span className="vital-label">{label}</span>
      <span className="vital-pips" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`pip ${i < filled ? 'is-on' : ''}`} />
        ))}
      </span>
      <span className="vital-value">{value}</span>
    </div>
  )
}

function Act1Intake({
  form,
  setForm,
  onSubmit,
  onLoadSample,
}: {
  form: IntakeForm
  setForm: (next: IntakeForm) => void
  onSubmit: () => void
  onLoadSample: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  const update = (patch: Partial<IntakeForm>) => setForm({ ...form, ...patch })

  const canSubmit = form.product.trim().length > 1 && form.budget.trim().length > 0

  const onFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      update({ creativeDataUrl: String(reader.result), creativeName: file.name })
    }
    reader.readAsDataURL(file)
  }

  return (
    <section className="act1">
      <div className="act1-eyebrow">
        <span className="section-num">§ 1 · CAMPAIGN INTAKE</span>
        <span className="rule" aria-hidden="true" />
        <span>5 sections</span>
      </div>
      <h1 className="act1-title">Brief the strategist.</h1>
      <p className="act1-subtitle">
        Five sections. I'll review the spec like a senior media buyer — pull category
        data, check Meta's policy line, run the budget math — <em>before</em> any spend
        goes live. Attach a creative and I'll run vision on it.
      </p>

      <div className="act1-grid">
       <div className="act1-form">
      <Field num="1.1" label="Product" delay={0}>
        <input
          className="field-input"
          type="text"
          autoFocus
          placeholder="What are you advertising?"
          value={form.product}
          onChange={(e) => update({ product: e.target.value })}
        />
      </Field>

      <Field num="1.2" label="Budget" delay={60}>
        <div className="field-prefix-row">
          <span className="field-prefix">$</span>
          <input
            className="field-input"
            inputMode="numeric"
            placeholder="500"
            value={form.budget}
            onChange={(e) => update({ budget: e.target.value.replace(/[^0-9]/g, '') })}
          />
          <span className="field-prefix" style={{ color: 'var(--gray-2)', fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
            USD · META
          </span>
        </div>
        <BudgetHint budget={form.budget} />
      </Field>

      <Field num="1.3" label="Audience" delay={120}>
        <input
          className="field-input"
          type="text"
          placeholder="Who should see this?"
          value={form.audience}
          onChange={(e) => update({ audience: e.target.value })}
        />
        <div className="field-chips">
          {AUDIENCE_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className="field-chip"
              onClick={() => update({ audience: c })}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      <Field num="1.4" label="Risky claim · optional" delay={180}>
        <textarea
          className="field-textarea"
          rows={2}
          placeholder="Anything in your copy that promises an outcome?"
          value={form.claim}
          onChange={(e) => update({ claim: e.target.value })}
        />
      </Field>

      <Field num="1.5" label="Creative · optional" delay={240}>
        <label
          className={`dropzone ${dragOver ? 'is-hover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFile(e.dataTransfer.files?.[0])
          }}
        >
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0] || undefined)}
          />
          {!form.creativeDataUrl ? (
            <>
              <div className="dropzone-text">
                <strong>Drop your ad mockup</strong> or click to upload
              </div>
              <div className="dropzone-hint">PNG · JPG · up to 4 MB · routed to Gemini Vision</div>
            </>
          ) : (
            <div className="dropzone-preview">
              <img src={form.creativeDataUrl} alt={form.creativeName || 'uploaded'} />
            </div>
          )}
        </label>
      </Field>

      <div className="act1-actions" style={{ animationDelay: '320ms' }}>
        <button
          type="button"
          className={`btn-primary ${canSubmit ? 'is-ready' : ''}`}
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          File the brief
          <span className="btn-arrow">→</span>
        </button>
        <button type="button" className="btn-ghost" onClick={onLoadSample}>
          Try a sample
        </button>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--gray-1)',
        }}>
          Required §1.1, §1.2
        </span>
      </div>
       </div>
        <BriefPreview form={form} />
      </div>
    </section>
  )
}

// ---------- types from /api/workspace/stream events ----------

type EvidenceItem = {
  id: string
  source_type: 'playwright' | 'knowledge_base' | 'policy_doc' | 'competitor_scrape' | 'vision' | string
  source_url?: string
  finding: string
  impact?: string
  stage_id?: string
  ts?: number
}

type BrowserSession = {
  id: string
  url: string
  title?: string
  highlighted_text?: string
  screenshot_url?: string
  ts?: number
}

type WorkspaceResult = {
  final_decision?: {
    status?: 'READY_PAUSED' | 'HOLD' | 'FIX_FIRST' | string
    summary?: string
    blockers?: string[]
  }
  causal_checks?: Array<{ name: string; status: string; reason?: string }>
  // (full schema lives in backend; this is what UI consumes)
  [k: string]: unknown
}

// ---------- SSE consumer for /api/workspace/stream ----------

type StreamHandlers = {
  onStageStart: (stage: { stage_id: string; label?: string }) => void
  onToolStart: (call: ToolCall) => void
  onToolDone: (id: string, patch: Partial<ToolCall>) => void
  onToolError: (id: string, error: string) => void
  onBrowserOpen: (session: BrowserSession) => void
  onBrowserClose: (id: string) => void
  onEvidence: (e: EvidenceItem) => void
  onWorkspaceDone: (w: WorkspaceResult) => void
  onError: (msg: string) => void
}

async function streamWorkspace(
  intake: Record<string, unknown>,
  signal: AbortSignal,
  h: StreamHandlers,
  opts: { demoMode?: boolean } = { demoMode: true },
) {
  const url = opts.demoMode ? '/api/workspace/stream?demo_mode=true' : '/api/workspace/stream'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(intake),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    h.onError(`Workspace stream failed: ${res.status} ${text.slice(0, 200)}`)
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let evt = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) evt = line.slice(6).trim()
        else if (line.startsWith('data:')) data = line.slice(5).trim()
      }
      if (!data) continue
      let p: any
      try { p = JSON.parse(data) } catch { continue }

      switch (evt) {
        case 'stage_start':
          h.onStageStart({ stage_id: p.stage_id, label: p.label })
          break
        case 'tool_call_start':
          h.onToolStart({
            id: p.id,
            tool: p.tool,
            summary: p.summary || '',
            status: 'running',
            input: p.input,
          })
          break
        case 'tool_call_done':
          h.onToolDone(p.id, {
            status: 'done',
            duration_ms: p.duration_ms,
            size_bytes: p.size_bytes,
            http_status: p.http_status,
            meta_extra: p.meta_extra,
            output: p.output_full || p.output_summary,
            summary: p.output_summary || undefined,
          })
          break
        case 'tool_call_error':
          h.onToolError(p.id, p.error || 'error')
          break
        case 'browser_open':
          h.onBrowserOpen({
            id: p.id,
            url: p.url,
            title: p.title,
            highlighted_text: p.highlighted_text,
            screenshot_url: p.screenshot_url,
          })
          break
        case 'browser_close':
          h.onBrowserClose(p.id)
          break
        case 'evidence_arrived':
          h.onEvidence({
            id: p.id,
            source_type: p.source_type,
            source_url: p.source_url,
            finding: p.finding,
            impact: p.impact,
            stage_id: p.stage_id,
          })
          break
        case 'workspace_done':
          h.onWorkspaceDone((p.workspace || p) as WorkspaceResult)
          break
        case 'end':
        case 'error':
          // handled by closure end
          break
      }
    }
  }
}

// ---------- BrowserCameo — overlay panel when agent visits a URL ----------

const SOURCE_LABELS: Record<string, string> = {
  playwright: 'Playwright',
  knowledge_base: 'Knowledge base',
  policy_doc: 'Policy doc',
  competitor_scrape: 'Competitor library',
  vision: 'Gemini Vision',
}

function BrowserCameo({ session }: { session: BrowserSession | null }) {
  if (!session) return null
  // Stylized representation. If a real screenshot_url arrives, use it; else
  // render the URL + highlighted text excerpt as a typographic page mockup.
  const host = (() => {
    try { return new URL(session.url).host } catch { return session.url }
  })()

  return (
    <aside className="browser-cameo" aria-live="polite">
      <div className="bc-chrome">
        <span className="bc-dots">
          <span /><span /><span />
        </span>
        <span className="bc-addr">
          <span className="bc-pad">⊙</span>
          <span className="bc-url">{session.url}</span>
        </span>
        <span className="bc-tag">AdAudit Browser</span>
      </div>
      <div className="bc-body">
        {session.screenshot_url ? (
          <img src={session.screenshot_url} alt={session.title || session.url} />
        ) : (
          <>
            <div className="bc-eyebrow">{host}</div>
            <div className="bc-title">{session.title || 'Document'}</div>
            <div className="bc-rule" />
            <div className="bc-text">
              {session.highlighted_text || 'Reading page content…'}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

// ---------- EvidencePanel — citations as agent collects them ----------

function EvidencePanel({ items }: { items: EvidenceItem[] }) {
  return (
    <div className="evidence-list">
      {items.length === 0 ? (
        <div className="act2-placeholder">
          <span className="placeholder-card" />
          <span className="placeholder-card" />
        </div>
      ) : (
        items.map((e, i) => (
          <article
            key={e.id || i}
            className="evidence-item"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="evidence-head">
              <span className={`evidence-source source-${e.source_type}`}>
                {SOURCE_LABELS[e.source_type] || e.source_type}
              </span>
              {e.source_url && (
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="evidence-url"
                >
                  {(() => {
                    try { return new URL(e.source_url).host } catch { return e.source_url }
                  })()}
                </a>
              )}
            </div>
            <div className="evidence-finding">{e.finding}</div>
            {e.impact && <div className="evidence-impact">→ {e.impact}</div>}
          </article>
        ))
      )}
    </div>
  )
}

// ---------- ToolCall — operational log line (Vercel/Linear ops aesthetic) ----------

type ToolStatus = 'pending' | 'running' | 'done' | 'error'

type ToolCall = {
  id: string
  tool: string
  summary: string
  status: ToolStatus
  duration_ms?: number
  size_bytes?: number
  http_status?: number
  meta_extra?: string
  input?: Record<string, unknown>
  output?: string
}

// MOCK_TOOL_CALLS removed in Phase 3.5 — real ToolCall[] now flows from
// /api/workspace/stream SSE events. Keep this comment for archaeology.

function ToolCallRow({
  call,
  expanded,
  onToggle,
}: {
  call: ToolCall
  expanded: boolean
  onToggle: () => void
}) {
  const mark =
    call.status === 'done'
      ? '✓'
      : call.status === 'running'
        ? '◐'
        : call.status === 'error'
          ? '✕'
          : '○'

  const metaBits: string[] = []
  if (call.duration_ms != null) metaBits.push(`${call.duration_ms}ms`)
  if (call.size_bytes != null) metaBits.push(`${(call.size_bytes / 1024).toFixed(1)}KB`)
  if (call.http_status != null) metaBits.push(String(call.http_status))
  if (call.meta_extra) metaBits.push(call.meta_extra)

  return (
    <div className={`toolcall toolcall-${call.status} ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" className="toolcall-row" onClick={onToggle}>
        <span className="tc-mark">{mark}</span>
        <span className="tc-tool">{call.tool}</span>
        <span className="tc-summary">{call.summary}</span>
        <span className="tc-meta">{metaBits.join(' · ')}</span>
        <span className="tc-chev">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (call.input || call.output) && (
        <div className="toolcall-detail">
          {call.input && (
            <div className="tc-detail-row">
              <span className="tc-detail-label">Input</span>
              <pre className="tc-detail-value">{JSON.stringify(call.input, null, 2)}</pre>
            </div>
          )}
          {call.output && (
            <div className="tc-detail-row">
              <span className="tc-detail-label">Output</span>
              <div className="tc-detail-value tc-detail-text">{call.output}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolCallStrip({ calls }: { calls: ToolCall[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doneCount = calls.filter((c) => c.status === 'done').length

  return (
    <>
      <div className="act2-eyebrow">
        <span>TOOL CALLS</span>
        <span className="rule" aria-hidden="true" />
        <span>
          {doneCount} / {calls.length} complete
        </span>
      </div>
      <div className="toolcalls">
        {calls.map((c) => (
          <ToolCallRow
            key={c.id}
            call={c}
            expanded={expanded.has(c.id)}
            onToggle={() => toggle(c.id)}
          />
        ))}
      </div>
    </>
  )
}

// ---------- CampaignCard — the visual hero for Act 2 ----------

function CampaignCard({ form }: { form: IntakeForm }) {
  const budgetNum = parseInt(form.budget || '0', 10) || 0
  const adSets = budgetNum >= 1000 ? 3 : budgetNum >= 300 ? 2 : 1
  const claimLower = (form.claim || '').toLowerCase()
  const claimRisk =
    !claimLower
      ? null
      : /\d+\s*(day|week|hour)|guarantee|land a job|get hired|in \d+|lose \d+/i.test(claimLower)
        ? 'high'
        : /promise|outcome|win|best|number one/i.test(claimLower)
          ? 'medium'
          : 'low'

  return (
    <section className="campaign-card" aria-label="Campaign under review">
      <div className="campaign-card-eyebrow">
        <span>§ THE CAMPAIGN</span>
        <span className="rule" aria-hidden="true" />
        <span>under review</span>
      </div>
      <div className="campaign-card-body">
        <div className="campaign-card-text">
          <h2 className="campaign-card-title">
            {form.product || 'Untitled campaign'}
          </h2>
          <div className="campaign-card-divider" />
          <div className="campaign-card-line">
            <span className="cc-stat">
              <em>${budgetNum || '—'}</em>
              <small>USD</small>
            </span>
            <span className="cc-sep">·</span>
            <span className="cc-stat">
              <em>{adSets}</em>
              <small>ad set{adSets > 1 ? 's' : ''}</small>
            </span>
            <span className="cc-sep">·</span>
            <span className="cc-stat">
              <em>META</em>
              <small>LEADS</small>
            </span>
          </div>
          <div className="campaign-card-line second">
            <span className="cc-tag">{form.audience || 'Audience pending'}</span>
            {claimRisk && (
              <span className={`cc-risk-tag risk-${claimRisk}`}>
                <span className="dot" />
                CLAIM RISK · {claimRisk.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        {form.creativeDataUrl ? (
          <div className="campaign-card-thumb">
            <img src={form.creativeDataUrl} alt={form.creativeName || 'creative'} />
          </div>
        ) : (
          <div className="campaign-card-thumb is-empty">
            <span>NO CREATIVE</span>
          </div>
        )}
      </div>
    </section>
  )
}

// ---------- Act 2 — Strategist review (shell + state) ----------

function Act2Workspace({
  form,
  onBack,
  onWorkspaceDone,
}: {
  form: IntakeForm
  onBack: () => void
  onWorkspaceDone?: (w: WorkspaceResult) => void
}) {
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [browserCameo, setBrowserCameo] = useState<BrowserSession | null>(null)
  const [stageLabel, setStageLabel] = useState<string>('Booting strategist')
  const [streamError, setStreamError] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const ctrl = new AbortController()
    const intake = {
      product: form.product || 'AI Resume Optimizer',
      budget_usd: parseInt(form.budget || '500', 10) || 500,
      audience: form.audience || 'US job seekers',
      claim: form.claim || undefined,
    }

    streamWorkspace(intake, ctrl.signal, {
      onStageStart: ({ label, stage_id }) => {
        setStageLabel(label || stage_id || 'working')
      },
      onToolStart: (call) => {
        setToolCalls((prev) => [...prev, call])
      },
      onToolDone: (id, patch) => {
        setToolCalls((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      },
      onToolError: (id, error) => {
        setToolCalls((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, status: 'error', summary: `${t.summary} · ${error}` } : t,
          ),
        )
      },
      onBrowserOpen: (s) => setBrowserCameo(s),
      onBrowserClose: () => setBrowserCameo(null),
      onEvidence: (e) => setEvidence((prev) => [...prev, e]),
      onWorkspaceDone: (w) => {
        setStageLabel('Verdict ready')
        onWorkspaceDone?.(w)
      },
      onError: (msg) => setStreamError(msg),
    }).catch((err) => {
      if ((err as Error).name !== 'AbortError') setStreamError((err as Error).message)
    })

    return () => ctrl.abort()
  }, [form, onWorkspaceDone])

  const stageCount = toolCalls.length
  const doneCount = toolCalls.filter((c) => c.status === 'done').length

  return (
    <section className="act2">
      <div className="act1-eyebrow">
        <span className="section-num" style={{ color: 'var(--signature)' }}>§ 2 · STRATEGIST REVIEW</span>
        <span className="rule" aria-hidden="true" />
        <span>in session</span>
      </div>
      <h1 className="act1-title">Reviewing your brief.</h1>
      <p className="act1-subtitle">
        Pulling category data, checking Meta's policy line, running the budget math.
        <em> Tool calls and evidence will surface here as I work.</em>
      </p>

      <div className="act2-progress">
        <div className="act2-progress-bar" />
      </div>

      <CampaignCard form={form} />

      <div className="act2-grid">
        <div className="act2-workspace">
          <div className="act2-stage-line">
            <span className="ind" />
            <span className="act2-stage-label">{stageLabel}</span>
            <span className="act2-stage-progress">
              {doneCount} / {stageCount || '—'} complete
            </span>
          </div>

          {streamError && (
            <div className="act2-error">
              <span>Stream error:</span> {streamError}
            </div>
          )}

          <div style={{ marginTop: 28 }}>
            <ToolCallStrip calls={toolCalls} />
          </div>

          <div className="act2-eyebrow" style={{ marginTop: 32 }}>
            <span>EVIDENCE</span>
            <span className="rule" aria-hidden="true" />
            <span style={{ color: 'var(--gray-1)' }}>{evidence.length} collected</span>
          </div>
          <EvidencePanel items={evidence} />
        </div>

        <BriefPreview form={form} />
      </div>

      <div className="act1-actions" style={{ marginTop: 64 }}>
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Edit brief
        </button>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--gray-1)',
        }}>
          Verdict drops in § 3
        </span>
      </div>

      <BrowserCameo session={browserCameo} />
    </section>
  )
}

// ---------- document footer ----------

function DocFooter() {
  const d = new Date()
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return (
    <footer className="doc-footer">
      <div className="doc-footer-rule" />
      <div className="doc-footer-row">
        <span>
          AdAudit · Spec <strong>#{specId()}</strong> · Issued by gemini 2.5-flash
        </span>
        <span>{dateStr} · {time} UTC</span>
        <span>1 of 1</span>
      </div>
    </footer>
  )
}

// ---------- App orchestrator ----------

function App() {
  const [act, setAct] = useState<Act>('intake')
  const [form, setForm] = useState<IntakeForm>(EMPTY_FORM)
  // workspaceResult will drive Act 3 verdict (Phase 6); prefix-underscore until then
  const [_workspaceResult, setWorkspaceResult] = useState<WorkspaceResult | null>(null)
  void _workspaceResult

  // derived: masthead pulses blue while the agent is working
  const working = act === 'reviewing'

  const handleSubmit = () => {
    // Phase 2: just transition to reviewing. Real SSE driver arrives in Phase 3.
    setAct('reviewing')
  }

  const specStatus = act === 'intake' ? 'DRAFT' : act === 'reviewing' ? 'IN REVIEW' : act === 'verdict' ? 'AWAITING APPROVAL' : act === 'revising' ? 'AMENDING' : 'PAUSED · APPROVED'

  return (
    <div className="shell">
      <Masthead working={working} specStatus={specStatus} />

      <main className="shell-main">
        {act === 'intake' && (
          <Act1Intake
            form={form}
            setForm={setForm}
            onSubmit={handleSubmit}
            onLoadSample={() => setForm(SAMPLE_FORM)}
          />
        )}

        {act === 'reviewing' && (
          <Act2Workspace
            form={form}
            onBack={() => setAct('intake')}
            onWorkspaceDone={(w) => setWorkspaceResult(w)}
          />
        )}

        {(act === 'verdict' || act === 'revising' || act === 'done') && (
          <section className="act1" style={{ paddingTop: 80 }}>
            <div className="act1-eyebrow">
              <span className="section-num">§ {act === 'verdict' ? '3' : '4'} · PLACEHOLDER</span>
              <span className="rule" aria-hidden="true" />
            </div>
            <h1 className="act1-title">
              {act === 'verdict' && 'Decision filed.'}
              {act === 'revising' && 'Amending the spec.'}
              {act === 'done' && 'Paused launch prepared.'}
            </h1>
            <p className="act1-subtitle">This act will be built in Phase 6+.</p>
            <button type="button" className="btn-ghost" onClick={() => setAct('intake')}>
              ← Return to intake
            </button>
          </section>
        )}
      </main>

      <DocFooter />
    </div>
  )
}

export default App
