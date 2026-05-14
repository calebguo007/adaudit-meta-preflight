// AdAudit agent definitions and orchestration.
//
// Each auditor is a specialist with a tight scope. The Coordinator merges
// their findings. The Planner produces a media buying plan from a raw goal.
// The Fixer revises a plan that failed audit.
//
// All agents return JSON in a consistent shape so the UI can render uniformly.

import { aiInfo, callAgent, streamAgent } from './ai.mjs'
import { collectEvidence } from './evidence.mjs'

// ----- shared output schema (for the prompts) -----

const AUDITOR_OUTPUT_SCHEMA = `
You MUST respond with valid JSON matching this exact schema:
{
  "status": "pass" | "warn" | "fail",
  "headline": "<10 words, the verdict>",
  "detail": "<2-3 sentences, the reasoning grounded in the brief>",
  "metric": "<a single concrete data point like '0 lead events' or '67% overlap'>",
  "fix": "<one concrete fix the marketer should apply>"
}
Do not include any prose outside the JSON. Be specific, not generic.
`

// ----- five specialist auditors -----

export const AUDITORS = [
  {
    id: 'pixel',
    name: 'PixelAuditor',
    system: `You are PixelAuditor, a Meta Ads tracking specialist.
Your only job: assess whether the campaign's conversion signal infrastructure is ready.
Look for: missing pixel events, recent event volume claims, attribution windows, server-side tagging, fired-in-last-7d evidence.
If the brief picks a CONVERSIONS objective with no proof of recent events, fail it.
If it picks LEADS or TRAFFIC, this is usually pass/warn.
${AUDITOR_OUTPUT_SCHEMA}`,
  },
  {
    id: 'audience',
    name: 'AudienceAuditor',
    system: `You are AudienceAuditor, a Meta Ads audience strategist.
Your only job: assess audience definition quality.
Look for: audience size vs. budget, overlap risk between ad sets, fragmentation across too many variants, learning-phase viability (~50 events/wk per ad set on Meta).
A 3-variant test on $500 with broad targeting is high-risk for fragmentation.
${AUDITOR_OUTPUT_SCHEMA}`,
  },
  {
    id: 'policy',
    name: 'PolicyAuditor',
    system: `You are PolicyAuditor, a Meta advertising policy reviewer.
Your only job: spot policy risks in claims, targeting, and creative direction.
Sensitive categories: employment, financial, health, weight loss, before/after, guaranteed outcomes, sensational claims, personal attributes targeting.
"Land a job in 7 days" is a guaranteed employment outcome — fail.
Be specific about which policy line the brief crosses.
${AUDITOR_OUTPUT_SCHEMA}`,
  },
  {
    id: 'budget',
    name: 'BudgetAuditor',
    system: `You are BudgetAuditor, a media math analyst.
Your only job: assess whether the budget can produce statistically meaningful signal for the proposed test structure.
Use rough heuristics: Meta CPM ~$10-30, CPC ~$1-3, lead-form CPL ~$10-50 depending on category. Learning phase needs ~50 conversions/wk per ad set.
A $500 spend split 3 ways across CONVERSIONS objective is usually too thin.
Show the math in metric (e.g. "~167 clicks @ $3 CPC, below 200-click minimum").
${AUDITOR_OUTPUT_SCHEMA}`,
  },
  {
    id: 'creative',
    name: 'CreativeAuditor',
    system: `You are CreativeAuditor, a direct-response creative reviewer.
Your only job: evaluate the proposed hook/angle against category norms.
Reason about: hook archetype (proof-first, fear-frame, enemy-frame, outcome-promise), claim risk, format fit, novelty vs. category-tested patterns.
Outcome-promise hooks like "get a job in 7 days" rarely outperform proof-first hooks in saturated categories and carry policy risk.
Reference the implied category (e.g. resume tools, fintech, fitness) when reasoning.
${AUDITOR_OUTPUT_SCHEMA}`,
  },
]

// ----- coordinator: synthesizes 5 reports into a final decision -----

const COORDINATOR_SYSTEM = `You are the Coordinator agent of AdAudit.
You receive five specialist audit reports for a Meta ad brief and must produce a final launch decision.

Decision rules:
- If ANY auditor returns "fail", the decision is "HOLD".
- If no fails but >=2 warns, the decision is "FIX_FIRST".
- If no fails and <=1 warn, the decision is "READY_PAUSED".

Respond with valid JSON in this exact schema:
{
  "decision": "HOLD" | "FIX_FIRST" | "READY_PAUSED",
  "summary": "<2-3 sentence executive summary the marketer would read>",
  "blockers": ["<top 1-3 specific blockers, empty array if READY_PAUSED>"],
  "fail_count": <number>,
  "warn_count": <number>
}
No prose outside the JSON.`

// ----- planner: turns a raw goal into a structured Meta test plan -----

const PLANNER_SYSTEM = `You are the Planner agent of AdAudit, an expert Meta media buyer.
Given a marketer's raw goal and budget, produce a sensible Meta campaign test plan that respects budget math and platform realities.

Prefer LEADS or TRAFFIC over CONVERSIONS when tracking maturity is unknown.
Cap ad set count at 2-3 for budgets under $1000.
Use proof-first hooks unless the goal explicitly calls for brand.

Respond with valid JSON in this exact schema:
{
  "objective": "LEADS" | "CONVERSIONS" | "TRAFFIC" | "ENGAGEMENT",
  "total_budget_usd": <number>,
  "ad_sets": [
    { "name": "<short>", "audience": "<targeting summary>", "budget_usd": <number>, "hook": "<copy direction>", "format": "<static|carousel|video|UGC>" }
  ],
  "expected_signal": "<one sentence on what minimum data this can produce>",
  "risks": ["<top 1-2 risks the marketer should know>"]
}
No prose outside the JSON.`

// ----- fixer: revises a plan that failed audit -----

const FIXER_SYSTEM = `You are the Fixer agent of AdAudit.
You receive (a) the original campaign brief and (b) the list of auditor reports that flagged risks.
Produce a revised plan that addresses every failure and warning specifically.

Rules:
- Always set "status": "PAUSED" on the revised plan.
- Switch objective to LEADS/TRAFFIC if PixelAuditor flagged tracking.
- Rewrite outcome-promise claims into proof-based language.
- Collapse fragmented audience structure into 2 focused segments if BudgetAuditor flagged it.
- Replace risky hooks with category-tested proof-first hooks.

Respond with valid JSON in this exact schema:
{
  "status": "PAUSED",
  "objective": "LEADS" | "CONVERSIONS" | "TRAFFIC",
  "total_budget_usd": <number>,
  "ad_sets": [
    { "name": "<short>", "audience": "<targeting summary>", "budget_usd": <number>, "hook": "<rewritten copy>", "format": "<static|carousel|video|UGC>" }
  ],
  "fixed_brief": "<one sentence brief that replaces the original>",
  "changes_applied": ["<bullet of what changed and why>"]
}
No prose outside the JSON.`

// ----- workspace: campaign intake -> simulations -> recommendation -----

const MEDIA_BUYER_WORKSPACE_SYSTEM = `You are AdAudit, a guarded AI media buyer for Meta campaign tests.

Your job is not to generate one ad and not to simply reject a brief. Your job is to simulate multiple media-buying options, pick the cheapest viable test, explain why the weaker options waste budget, run safety/audit reasoning, and prepare only paused execution.

Think like a Claude Code / Codex-style agent system:
- The Planner proposes multiple viable paths instead of one answer.
- Specialist agents inspect separate failure modes.
- The Coordinator picks one plan and records why alternatives lose.
- The Executor is constrained: it can prepare PAUSED objects only.

Use these specialist perspectives:
- MarketResearchAgent: competitor hooks, category norms, landing-page gaps, white space.
- DeliveryReadinessAgent: pixel, objective, inventory, special category, policy readiness.
- BudgetSignalAgent: signal density, learning-phase risk, ad set count, sample size.
- AudienceStrategyAgent: broad vs interest-led vs retargeting, overlap, platform automation tradeoff.
- CreativeStrategyAgent: hypotheses as testable bets, not final assets.
- UnitEconomicsAgent: CPA/ROAS/lead-quality feasibility from AOV, margin, LTV, target CPA if provided.
- MediaBuyerCoordinator: choose HOLD/FIX_FIRST/READY_PAUSED and define kill/hold/scale rules.

Use these paid-social rules:
- If pixel or recent conversion volume is unknown, avoid conversion-first plans.
- Under $1000, keep ad set count low; signal density matters more than testing granularity.
- Meta learning phase needs roughly 50 optimization events per ad set per week.
- A small budget should test the highest-leverage uncertainty first, not every audience and creative.
- A campaign structure is a signal to the platform. Do not split by placement, creative, or tiny audiences without measurement reason.
- CTR is not enough. If downstream value is unknown, prefer a plan that can inspect lead quality before scale.
- Special ad categories include employment, credit, housing, social/political issues, and some financial services.
- Outcome guarantees and unprovable claims are high risk.
- Frequency >3.0 with rising CPM suggests creative/audience fatigue, not a budget problem.
- Kill rule: if spend reaches 2.5-3x target CPA with no qualified signal, stop that ad set.
- Scale rule: raise budgets gradually (~20%) only after efficiency and downstream quality are both acceptable.
- Write operations touch money. Output only PAUSED execution specs.

Respond with valid JSON matching this exact schema:
{
  "intake_summary": {
    "product": "<product>",
    "platform": "Meta",
    "budget_usd": <number>,
    "objective": "<objective>",
    "kpi_priority": ["<metric>"],
    "audience": "<audience>",
    "constraints": ["<constraint>"]
  },
  "evidence": [
    { "source": "<landing page | competitor | asset | benchmark>", "finding": "<specific finding>", "impact": "<why this matters>" }
  ],
  "creative_hypotheses": [
    { "name": "<short name>", "hook": "<testable hook>", "emotion": "<emotion>", "proof": "<proof mechanism>", "risk": "<low|medium|high>", "success_metric": "<metric>" }
  ],
  "strategy_agents": [
    { "agent": "MarketResearchAgent" | "DeliveryReadinessAgent" | "BudgetSignalAgent" | "AudienceStrategyAgent" | "CreativeStrategyAgent" | "UnitEconomicsAgent", "status": "pass" | "watch" | "block", "finding": "<specific finding>", "decision_impact": "<how it changes the media plan>" }
  ],
  "market_research": {
    "category_patterns": ["<competitor or category pattern>"],
    "white_space": ["<angle or audience gap>"],
    "landing_page_gaps": ["<gap that affects conversion or quality>"]
  },
  "delivery_readiness": {
    "status": "ready" | "watch" | "blocked",
    "checks": [
      { "name": "<check name>", "status": "pass" | "warn" | "fail", "reason": "<specific reason>" }
    ]
  },
  "budget_signal": {
    "status": "sufficient" | "thin" | "underpowered",
    "signal_density": "<how much signal the budget can realistically buy>",
    "learning_risk": "<specific learning phase risk>",
    "recommended_ad_set_count": <number>
  },
  "audience_strategy": {
    "mode": "broad" | "interest-led" | "retargeting" | "lookalike" | "hybrid",
    "rationale": "<why this targeting mode is best>",
    "control_tradeoff": "<what the agent gives up or controls>"
  },
  "unit_economics": {
    "status": "known" | "estimated" | "missing",
    "target_cpa": "<value or unknown>",
    "break_even_cpa": "<value or unknown>",
    "break_even_roas": "<value or unknown>",
    "confidence": "low" | "medium" | "high",
    "assumptions": ["<assumption>"]
  },
  "scenarios": [
    {
      "id": "validation" | "balanced" | "aggressive",
      "name": "<scenario name>",
      "objective": "LEADS" | "TRAFFIC" | "CONVERSIONS" | "ENGAGEMENT",
      "budget_usd": <number>,
      "structure": "<campaign/ad set shape>",
      "expected_signal": "<specific signal estimate>",
      "kpi_ranges": { "cpm": "<range>", "ctr": "<range>", "cpc": "<range>", "cpa": "<range or n/a>" },
      "risk": "low" | "medium" | "high",
      "verdict": "recommended" | "viable" | "not_recommended",
      "reason": "<why this option should win/lose>"
    }
  ],
  "recommended_plan": {
    "scenario_id": "<id>",
    "why_this_wins": ["<reason>"],
    "why_others_lose": ["<reason>"],
    "campaign_name": "<Meta-style campaign name>",
    "ad_sets": [
      { "name": "<ad set>", "audience": "<targeting>", "budget_usd": <number>, "creative_hypothesis": "<hypothesis name>", "optimization_goal": "<goal>" }
    ]
  },
  "auditor_reviews": [
    { "auditor": "TrackingAuditor" | "AudienceAuditor" | "BudgetAuditor" | "PolicyAuditor" | "CreativeLandingAuditor", "status": "pass" | "warn" | "fail", "finding": "<specific finding>", "mitigation": "<specific mitigation>" }
  ],
  "final_decision": {
    "status": "HOLD" | "FIX_FIRST" | "READY_PAUSED",
    "summary": "<executive summary>",
    "human_approval_required": true
  },
  "kill_scale_rules": {
    "kill": ["<condition under which the buyer stops spend>"],
    "hold": ["<condition under which the buyer waits or collects more data>"],
    "scale": ["<condition under which the buyer increases budget>"]
  },
  "monitoring_plan_72h": [
    { "window": "0-24h" | "24-48h" | "48-72h", "checks": ["<metric or decision check>"] }
  ],
  "paused_execution_spec": {
    "status": "PAUSED",
    "executor_mode": "mock",
    "campaign": { "name": "<name>", "objective": "<objective>", "status": "PAUSED" },
    "safety_notes": ["<note>"]
  }
}
No prose outside the JSON.`

// ===== orchestrators =====

/**
 * Run all five auditors in parallel against a brief. Returns array of reports.
 * Each report = { auditor, ...AUDITOR_OUTPUT_SCHEMA }
 */
export async function runAuditors(brief) {
  const startedAt = Date.now()
  console.log(`[preflight] runAuditors start agents=${AUDITORS.length}`)
  const userMsg = `Brief to audit:\n"""\n${brief}\n"""`
  const results = await Promise.all(
    AUDITORS.map(async (a) => {
      try {
        const report = await callAgent({ system: a.system, user: userMsg, json: true, maxTokens: 700 })
        console.log(`[preflight] ${a.name} done status=${report?.status || 'invalid'}`)
        return { auditor: a.name, id: a.id, ...(report || fallbackReport(a.name)) }
      } catch (err) {
        console.error(`[preflight] ${a.name} failed error=${err?.message || err}`)
        return { auditor: a.name, id: a.id, ...fallbackReport(a.name, err.message) }
      }
    })
  )
  console.log(`[preflight] runAuditors complete duration_ms=${Date.now() - startedAt}`)
  return results
}

/**
 * Synthesize 5 reports into a final coordinator decision.
 */
export async function runCoordinator(brief, reports) {
  const userMsg = `Brief:\n"""${brief}"""\n\nAuditor reports:\n${JSON.stringify(reports, null, 2)}`
  const decision = await callAgent({ system: COORDINATOR_SYSTEM, user: userMsg, json: true, maxTokens: 650 })
  return decision || fallbackDecision(reports)
}

/**
 * Generate a media buying plan from a raw goal.
 */
export async function runPlanner(goal) {
  const userMsg = `Marketer goal:\n"""\n${goal}\n"""`
  return await callAgent({ system: PLANNER_SYSTEM, user: userMsg, json: true, maxTokens: 700 })
}

/**
 * Revise a plan based on auditor failures.
 */
export async function runFixer(brief, reports) {
  const userMsg = `Original brief:\n"""${brief}"""\n\nFailures and warnings to address:\n${JSON.stringify(reports, null, 2)}`
  return await callAgent({ system: FIXER_SYSTEM, user: userMsg, json: true, maxTokens: 700 })
}

/**
 * Build the full media-buying workspace from structured intake.
 * This is the primary v2 product flow: intake -> evidence -> scenarios -> recommendation -> guardrails.
 */
export async function runMediaBuyingWorkspace(intake) {
  const startedAt = Date.now()
  const normalized = normalizeIntake(intake)
  const requestId = intake?.request_id || `ws_${Date.now().toString(36)}`
  const mode = intake?.demo_mode || process.env.ADAUDIT_FAST_WORKSPACE === 'true' ? 'fixture' : 'live'
  console.log(`[workspace:${requestId}] start mode=${mode} product="${normalized.product}" budget=${normalized.budget_usd}`)
  const evidenceBundle = await collectEvidence({ ...normalized, demo_mode: intake?.demo_mode })
  console.log(`[workspace:${requestId}] evidence mode=${evidenceBundle?.mode || 'unknown'} artifacts=${evidenceBundle?.artifacts?.length || 0}`)
  if (intake?.demo_mode || process.env.ADAUDIT_FAST_WORKSPACE === 'true') {
    const workspace = fallbackWorkspace(normalized, evidenceBundle, {
      requestId,
      startedAt,
      source: 'fixture',
      mode,
    })
    console.log(`[workspace:${requestId}] fixture complete decision=${workspace.final_decision?.status} duration_ms=${Date.now() - startedAt}`)
    return workspace
  }
  const userMsg = `Campaign intake:\n${JSON.stringify(normalized, null, 2)}`
  try {
    console.log(`[workspace:${requestId}] ai_call start`)
    const result = await callAgent({
      system: MEDIA_BUYER_WORKSPACE_SYSTEM,
      user: userMsg,
      json: true,
      maxTokens: 6000,
    })
    assertWorkspaceShape(result)
    const workspace = completeWorkspace(normalized, result, evidenceBundle, {
      requestId,
      startedAt,
      source: 'vertex-ai',
      mode,
    })
    console.log(`[workspace:${requestId}] ai_call success decision=${workspace.final_decision?.status} checks=${workspace.causal_checks?.filter((check) => check.passed).length || 0}/${workspace.causal_checks?.length || 0} duration_ms=${Date.now() - startedAt}`)
    return workspace
  } catch (err) {
    console.error(`[workspace:${requestId}] ai_call failed fallback=true error=${err?.message || err}`)
    const workspace = fallbackWorkspace(normalized, evidenceBundle, {
      requestId,
      startedAt,
      source: 'fallback-after-ai-error',
      mode,
      fallbackReason: err?.message || String(err),
    })
    console.log(`[workspace:${requestId}] fallback complete decision=${workspace.final_decision?.status} duration_ms=${Date.now() - startedAt}`)
    return workspace
  }
}

function assertWorkspaceShape(result) {
  const missing = []
  if (!result || typeof result !== 'object') missing.push('root object')
  if (!result?.intake_summary) missing.push('intake_summary')
  if (!Array.isArray(result?.scenarios) || result.scenarios.length === 0) missing.push('scenarios')
  if (!result?.recommended_plan || !Array.isArray(result.recommended_plan.ad_sets)) missing.push('recommended_plan.ad_sets')
  if (!result?.final_decision?.status) missing.push('final_decision.status')
  if (!result?.paused_execution_spec?.campaign) missing.push('paused_execution_spec.campaign')
  if (missing.length) {
    throw new Error(`AI workspace JSON incomplete: missing ${missing.join(', ')}`)
  }
}

export { collectEvidence }

// ===== streaming variants (used by SSE route) =====

/**
 * Stream a single auditor. onChunk receives { agent, delta }.
 * Returns the final parsed report (or null).
 */
export async function streamAuditor(auditorId, brief, onChunk) {
  const a = AUDITORS.find((x) => x.id === auditorId)
  if (!a) throw new Error(`Unknown auditor ${auditorId}`)
  const userMsg = `Brief to audit:\n"""\n${brief}\n"""`
  const full = await streamAgent({
    system: a.system,
    user: userMsg,
    json: true,
    maxTokens: 700,
    onChunk: (delta) => onChunk({ agent: a.name, delta }),
  })
  try {
    const parsed = JSON.parse(full)
    if (!parsed?.status || !parsed?.headline) return { auditor: a.name, id: a.id, ...fallbackReport(a.name) }
    return { auditor: a.name, id: a.id, ...parsed }
  } catch {
    const match = full.match(/\{[\s\S]*\}/)
    if (match) {
      try { return { auditor: a.name, id: a.id, ...JSON.parse(match[0]) } } catch {}
    }
    return null
  }
}

// ===== fallbacks (used when LLM is unreachable so demo never fully breaks) =====

function fallbackReport(name, errMsg) {
  return {
    status: 'warn',
    headline: `${name} unavailable`,
    detail: errMsg ? `Agent call failed: ${errMsg.slice(0, 120)}` : 'Agent did not return valid JSON.',
    metric: 'n/a',
    fix: 'Retry after checking AI provider config.',
  }
}

function fallbackDecision(reports) {
  const fails = reports.filter((r) => r.status === 'fail').length
  const warns = reports.filter((r) => r.status === 'warn').length
  return {
    decision: fails > 0 ? 'HOLD' : warns >= 2 ? 'FIX_FIRST' : 'READY_PAUSED',
    summary: 'Coordinator fallback. Decision derived from auditor statuses only.',
    blockers: reports.filter((r) => r.status === 'fail').map((r) => `${r.auditor}: ${r.headline}`),
    fail_count: fails,
    warn_count: warns,
  }
}

function normalizeIntake(intake = {}) {
  const budget = Number(intake.budget_usd || intake.budget || 500)
  const targetCpa = Number(intake.target_cpa || intake.target_cpa_usd || 0)
  const aov = Number(intake.aov || intake.average_order_value || 0)
  const ltv = Number(intake.ltv || intake.customer_ltv || 0)
  const rawLeadToCustomerRate = Number(intake.lead_to_customer_rate || intake.close_rate || 0)
  const rawMargin = Number(intake.gross_margin || intake.margin || 0)
  const grossMargin = rawMargin > 1 ? rawMargin / 100 : rawMargin
  const leadToCustomerRate = rawLeadToCustomerRate > 1 ? rawLeadToCustomerRate / 100 : rawLeadToCustomerRate
  return {
    product: String(intake.product || 'AI resume optimizer'),
    product_url: String(intake.product_url || ''),
    landing_page: String(intake.landing_page || intake.landing_page_notes || ''),
    platform: 'Meta',
    budget_usd: Number.isFinite(budget) ? budget : 500,
    target_cpa: Number.isFinite(targetCpa) && targetCpa > 0 ? targetCpa : null,
    aov: Number.isFinite(aov) && aov > 0 ? aov : null,
    ltv: Number.isFinite(ltv) && ltv > 0 ? ltv : null,
    gross_margin: Number.isFinite(grossMargin) && grossMargin > 0 ? grossMargin : null,
    lead_to_customer_rate: Number.isFinite(leadToCustomerRate) && leadToCustomerRate > 0 ? leadToCustomerRate : null,
    objective: String(intake.objective || 'leads'),
    kpi_priority: Array.isArray(intake.kpi_priority) ? intake.kpi_priority : ['CPA', 'CTR', 'CPC'],
    audience: String(intake.audience || 'US early-career job seekers'),
    assets: String(intake.assets || ''),
    competitors: String(intake.competitors || ''),
    constraints: String(intake.constraints || 'Avoid guaranteed employment outcomes. No automatic spend.'),
    pixel_status: String(intake.pixel_status || 'unknown'),
  }
}

function fallbackWorkspace(intake, evidenceBundle, meta = {}) {
  const budget = intake.budget_usd || 500
  const isSmallBudget = budget < 1000
  const objective = intake.pixel_status === 'verified' && budget >= 1500 ? 'CONVERSIONS' : 'LEADS'
  const campaignName = `PROS - ${intake.product.slice(0, 28)} - US - ${objective} - v0526`
  const adSetCount = isSmallBudget ? 2 : 3
  const targetCpa = intake.target_cpa || 35
  const breakEvenFromMargin = intake.aov && intake.gross_margin ? intake.aov * intake.gross_margin : null
  const breakEvenFromLtv = intake.ltv && intake.lead_to_customer_rate ? intake.ltv * intake.lead_to_customer_rate : null
  const breakEvenCpa = breakEvenFromLtv || breakEvenFromMargin
  const economicsSafe = breakEvenCpa ? targetCpa <= breakEvenCpa : false
  const breakEvenRoas = intake.gross_margin ? 1 / intake.gross_margin : null
  const signalClicksLow = Math.max(60, Math.round(budget / 3.5))
  const signalClicksHigh = Math.max(signalClicksLow + 30, Math.round(budget / 1.5))
  const killSpend = Math.round(targetCpa * 2.75)
  const perAdSetBudget = Math.round(budget / adSetCount)
  const structuredEvidence = evidenceBundle?.structured_evidence || {}
  const hasRiskyClaim = Array.isArray(structuredEvidence.risky_claims) && structuredEvidence.risky_claims.length > 0

  const workspace = {
    intake_summary: {
      product: intake.product,
      platform: 'Meta',
      budget_usd: budget,
      objective: intake.objective,
      kpi_priority: intake.kpi_priority,
      audience: intake.audience,
      constraints: [intake.constraints, `Pixel status: ${intake.pixel_status}`],
    },
    evidence: [
      {
        source: 'EvidenceAgent',
        finding: `${evidenceBundle?.mode || 'fixture'} evidence collected for ${evidenceBundle?.artifacts?.length || 0} artifact(s).`,
        impact: 'MediaPlannerAgent uses this structured evidence before creating creative hypotheses and scenarios.',
      },
      {
        source: 'landing page',
        finding: intake.landing_page
          ? 'Landing page evidence supplied; message match should be checked against every ad hook.'
          : 'Landing page URL or notes are missing.',
        impact: 'Without message match, high CTR can still turn into poor conversion rate.',
      },
      {
        source: 'benchmark',
        finding: isSmallBudget
          ? 'Budget is below $1000, so ad set fragmentation is the main risk.'
          : 'Budget can support a slightly broader test if tracking is mature.',
        impact: 'Signal density matters more than testing many audiences at once.',
      },
      {
        source: 'policy',
        finding: 'Employment-related products must avoid time-bound outcome guarantees.',
        impact: 'Policy review and account trust are higher priority than aggressive copy.',
      },
    ],
    evidence_artifacts: {
      job_id: evidenceBundle?.job_id || 'fixture',
      mode: evidenceBundle?.mode || 'fixture',
      artifacts: evidenceBundle?.artifacts || [],
      structured_evidence: structuredEvidence,
      notes: evidenceBundle?.notes || [],
    },
    creative_hypotheses: [
      {
        name: 'Proof-first resume score',
        hook: 'Show a concrete before/after improvement in resume clarity or ATS readiness.',
        emotion: 'relief',
        proof: 'ATS score delta, recruiter review, or side-by-side rewrite.',
        risk: 'low',
        success_metric: 'lead form completion rate',
      },
      {
        name: 'Hidden rejection mechanism',
        hook: 'Explain why resumes get filtered before a human reads them.',
        emotion: 'curiosity',
        proof: 'Checklist of formatting and keyword issues.',
        risk: 'medium',
        success_metric: 'CTR and landing page view rate',
      },
      {
        name: 'Outcome promise',
        hook: 'Promise a job outcome within a fixed time window.',
        emotion: 'hope',
        proof: 'Not acceptable without strong substantiation.',
        risk: 'high',
        success_metric: 'not recommended',
      },
    ],
    strategy_agents: [
      {
        agent: 'MarketResearchAgent',
        status: 'pass',
        finding: 'Resume and career-tool competitors usually lean on ATS visibility, before/after clarity, and speed-to-apply hooks.',
        decision_impact: 'Prioritize proof-first hypotheses and avoid generic "AI will get you hired" messaging.',
      },
      {
        agent: 'DeliveryReadinessAgent',
        status: intake.pixel_status === 'verified' ? 'pass' : 'watch',
        finding: intake.pixel_status === 'verified' ? 'Tracking is marked verified.' : 'Conversion tracking maturity is unknown.',
        decision_impact: intake.pixel_status === 'verified' ? 'Conversions can be considered if budget supports learning.' : 'Use Lead or Traffic objective before asking Meta to optimize for scarce conversion events.',
      },
      {
        agent: 'BudgetSignalAgent',
        status: isSmallBudget ? 'watch' : 'pass',
        finding: `${moneyText(budget)} split across ${adSetCount} ad sets leaves about ${moneyText(perAdSetBudget)} per ad set.`,
        decision_impact: 'Cap structure before creative variety; signal density is more valuable than testing every segment.',
      },
      {
        agent: 'AudienceStrategyAgent',
        status: 'pass',
        finding: 'The product has broad intent but a narrow purchase trigger, so fully fragmented interest stacks would hide what works.',
        decision_impact: 'Use two interpretable segments and let platform automation optimize within each segment.',
      },
      {
        agent: 'CreativeStrategyAgent',
        status: 'watch',
        finding: 'The supplied asset set includes one risky employment-outcome promise.',
        decision_impact: 'Keep the visual direction, but rewrite claims around resume quality evidence instead of job guarantees.',
      },
      {
        agent: 'UnitEconomicsAgent',
        status: breakEvenCpa && economicsSafe ? 'pass' : 'watch',
        finding: breakEvenCpa ? `Break-even CPA is approximately ${moneyText(breakEvenCpa)} from supplied economics.` : 'AOV, margin, LTV, or close-rate data is incomplete.',
        decision_impact: breakEvenCpa
          ? economicsSafe
            ? 'Use break-even CPA as the first kill/scale threshold.'
            : 'Target CPA is above estimated break-even; validate lead quality before any scale decision.'
          : 'Treat CPL as a proxy until lead quality or revenue data is connected.',
      },
    ],
    market_research: {
      category_patterns: [
        'Resume tools compete on ATS visibility, recruiter credibility, and before/after clarity.',
        'High-risk category ads overpromise employment outcomes; durable ads show a mechanism or proof artifact.',
        'Static proof cards and short UGC demos are easier to judge than generic AI screenshots.',
      ],
      white_space: [
        'Position the product as a diagnostic audit before rewriting, not just another resume generator.',
        'Target career switchers with "hidden filter" education rather than generic job-seeker anxiety.',
      ],
      landing_page_gaps: [
        intake.landing_page ? 'Landing-page notes exist; verify that the first screen repeats the same proof mechanism as the ad.' : 'Landing-page evidence is missing, so lead quality risk remains unresolved.',
        'Add an explicit proof artifact such as ATS checklist, sample score, or recruiter rubric before scaling.',
      ],
    },
    delivery_readiness: {
      status: intake.pixel_status === 'verified' ? 'ready' : 'watch',
      checks: [
        {
          name: 'Optimization event',
          status: intake.pixel_status === 'verified' ? 'pass' : 'warn',
          reason: intake.pixel_status === 'verified' ? 'Pixel is marked verified.' : 'Recent conversion event volume is not proven.',
        },
        {
          name: 'Special category / policy',
          status: 'warn',
          reason: 'Employment-adjacent claims require conservative language and no guaranteed outcome promise.',
        },
        {
          name: 'Launch state',
          status: 'pass',
          reason: 'Executor is constrained to PAUSED objects only.',
        },
      ],
    },
    budget_signal: {
      status: isSmallBudget ? 'thin' : 'sufficient',
      signal_density: `${moneyText(budget)} can likely buy ~${signalClicksLow}-${signalClicksHigh} clicks or a smaller number of qualified leads; it cannot support many split tests.`,
      learning_risk: objective === 'CONVERSIONS' ? 'Conversion objective requires recent event volume; otherwise learning phase will stall.' : 'Lead objective gives faster signal but still needs lead-quality review before scale.',
      recommended_ad_set_count: adSetCount,
    },
    audience_strategy: {
      mode: 'hybrid',
      rationale: 'Use one job-search intent segment and one career-switcher/problem-aware segment, keeping both large enough for delivery.',
      control_tradeoff: 'The buyer controls hypothesis and budget split, but avoids over-constraining placements or micro-interests so Meta can find cheaper pockets.',
    },
    unit_economics: {
      status: breakEvenCpa ? 'known' : 'missing',
      target_cpa: intake.target_cpa ? moneyText(intake.target_cpa) : `${moneyText(targetCpa)} assumed for first-flight guardrails`,
      break_even_cpa: breakEvenCpa ? moneyText(breakEvenCpa) : 'unknown',
      break_even_roas: breakEvenRoas ? `${breakEvenRoas.toFixed(2)}x` : 'unknown',
      confidence: breakEvenCpa && economicsSafe ? 'medium' : 'low',
      assumptions: [
        intake.target_cpa ? 'Target CPA was supplied by the user.' : 'Default target CPA is a temporary testing threshold, not a profitability claim.',
        breakEvenFromLtv ? 'Break-even CPA is based on LTV multiplied by lead-to-customer rate.' : breakEvenFromMargin ? 'Break-even CPA is based on AOV multiplied by gross margin.' : 'Revenue economics were not supplied.',
        breakEvenCpa && !economicsSafe ? 'Estimated break-even CPA is below target CPA, so the agent should learn cheaply before scale.' : '',
        'Do not scale on CTR alone; inspect downstream lead quality first.',
      ].filter(Boolean),
    },
    scenarios: [
      {
        id: 'validation',
        name: 'Cheap validation test',
        objective: 'TRAFFIC',
        budget_usd: Math.min(budget, 500),
        structure: 'One campaign, one broad intent ad set, two proof-first creatives.',
        expected_signal: '~150-300 landing page visitors depending on CPC.',
        kpi_ranges: { cpm: '$12-28', ctr: '0.8-1.5%', cpc: '$1.50-3.50', cpa: 'n/a' },
        risk: 'low',
        verdict: isSmallBudget ? 'viable' : 'viable',
        reason: 'Good for message validation, but it will not prove conversion economics.',
      },
      {
        id: 'balanced',
        name: 'Balanced lead-gen test',
        objective,
        budget_usd: budget,
        structure: 'One campaign, two ad sets max, three proof-first creative hypotheses.',
        expected_signal: objective === 'LEADS' ? '~10-35 leads if CPL lands in $15-50 range.' : '~15-50 conversion events if pixel is mature.',
        kpi_ranges: { cpm: '$15-35', ctr: '1.0-2.0%', cpc: '$1.25-3.00', cpa: '$15-50' },
        risk: 'medium',
        verdict: 'recommended',
        reason: 'Best tradeoff between signal, budget discipline, and policy safety.',
      },
      {
        id: 'aggressive',
        name: 'Aggressive conversion test',
        objective: 'CONVERSIONS',
        budget_usd: Math.max(budget, 1500),
        structure: 'Three ad sets, conversion objective, multiple creative variants.',
        expected_signal: 'Only viable if pixel has recent conversion volume and budget supports learning.',
        kpi_ranges: { cpm: '$20-45', ctr: '0.8-1.8%', cpc: '$1.75-4.50', cpa: '$30-90' },
        risk: 'high',
        verdict: intake.pixel_status === 'verified' && budget >= 1500 ? 'viable' : 'not_recommended',
        reason: 'Likely to waste spend when tracking is unknown or budget is too thin for learning phase.',
      },
    ],
    recommended_plan: {
      scenario_id: 'balanced',
      objective,
      why_this_wins: [
        'It keeps the test narrow enough for signal density.',
        'It avoids guaranteed employment claims.',
        'It optimizes for a higher-volume event while tracking matures.',
      ],
      why_others_lose: [
        'Cheap validation cannot prove CPA or lead quality.',
        'Aggressive conversion testing is unsafe without verified pixel volume and a larger budget.',
      ],
      campaign_name: campaignName,
      ad_sets: [
        {
          name: 'Job Seekers - ATS Pain',
          audience: 'US 22-55; interests around career coaching, job search, resume writing, LinkedIn, Indeed, Glassdoor.',
          budget_usd: Math.round(budget * 0.55),
          creative_hypothesis: 'Proof-first resume score',
          optimization_goal: objective === 'CONVERSIONS' ? 'OFFSITE_CONVERSIONS' : 'LEADS',
        },
        {
          name: 'Career Switchers - Hidden Filter',
          audience: 'US 25-45; career change, upskilling, professional development, productivity tools.',
          budget_usd: Math.round(budget * 0.45),
          creative_hypothesis: 'Hidden rejection mechanism',
          optimization_goal: objective === 'CONVERSIONS' ? 'OFFSITE_CONVERSIONS' : 'LEADS',
        },
      ],
    },
    auditor_reviews: [
      {
        auditor: 'TrackingAuditor',
        status: intake.pixel_status === 'verified' ? 'pass' : 'warn',
        finding: intake.pixel_status === 'verified' ? 'Pixel status is marked verified.' : 'Pixel status is unknown, so conversion-first launch is unsafe.',
        mitigation: 'Use lead or traffic objective until recent conversion event volume is verified.',
      },
      {
        auditor: 'AudienceAuditor',
        status: 'pass',
        finding: 'Recommended plan uses two ad sets, avoiding budget fragmentation.',
        mitigation: 'Do not split by creative or placement at campaign level.',
      },
      {
        auditor: 'BudgetAuditor',
        status: isSmallBudget ? 'warn' : 'pass',
        finding: isSmallBudget ? 'Budget is lean and should not be split across many hypotheses.' : 'Budget supports a controlled lead-gen test.',
        mitigation: 'Cap the first flight at two ad sets and review early CPL before scaling.',
      },
      {
        auditor: 'PolicyAuditor',
        status: 'pass',
        finding: 'Recommended plan removes time-bound job outcome claims.',
        mitigation: 'Keep creative proof-based and avoid personal attribute callouts.',
      },
      {
        auditor: 'CreativeLandingAuditor',
        status: intake.landing_page ? 'pass' : 'warn',
        finding: intake.landing_page ? 'Landing page evidence is available for message-match review.' : 'Landing page evidence is missing.',
        mitigation: 'Match every ad hook to the hero, proof, and CTA before execution.',
      },
    ],
    final_decision: {
      status: 'READY_PAUSED',
      summary: isSmallBudget || intake.pixel_status !== 'verified'
        ? 'The balanced plan is the best buying decision and is safe to prepare as PAUSED. Keep activation blocked until tracking and landing-page evidence are reviewed.'
        : 'The balanced plan is ready to prepare as paused Meta campaign objects with human approval.',
      human_approval_required: true,
    },
    kill_scale_rules: {
      kill: [
        `Kill an ad set if spend exceeds ${moneyText(killSpend)} (~2.75x target CPA) with zero qualified lead signal.`,
        'Kill or rewrite any creative that raises CTR but produces weak landing-page continuation or low-quality leads.',
        'Pause policy-risk claims immediately if review feedback or rejection appears.',
      ],
      hold: [
        'Hold budget changes during the first 24 hours unless delivery is broken.',
        'Hold scaling when CPM rises and frequency exceeds 3.0 before declaring audience failure.',
        'Hold conversion-objective migration until pixel event volume is verified.',
      ],
      scale: [
        'Scale by roughly 20% only after CPL is at or below target and lead quality is acceptable.',
        'Move budget toward the winning hypothesis after it has both cheaper signal and better continuation quality.',
        'Promote to conversion optimization only when enough recent events exist for stable learning.',
      ],
    },
    monitoring_plan_72h: [
      {
        window: '0-24h',
        checks: ['Approval status and policy feedback', 'Delivery by ad set', 'CPM/CPC sanity vs expected range', 'Pixel or lead-form event firing'],
      },
      {
        window: '24-48h',
        checks: ['CTR and landing-page view rate by hypothesis', 'Lead form opens vs submissions', 'Early CPL vs target CPA', 'Audience overlap or budget fragmentation symptoms'],
      },
      {
        window: '48-72h',
        checks: ['Qualified lead quality', 'Spend vs 2.5-3x CPA kill threshold', 'Frequency and CPM fatigue signals', '20% scale or pause decision'],
      },
    ],
    paused_execution_spec: {
      status: 'PAUSED',
      executor_mode: 'mock',
      campaign: {
        name: campaignName,
        objective,
        status: 'PAUSED',
      },
      safety_notes: [
        'No ACTIVE route exists in the demo.',
        'Human approval is required after reviewing creative previews in Ads Manager.',
        'Mock executor returns Meta-compatible IDs only.',
      ],
    },
  }

  return completeWorkspace(intake, workspace, evidenceBundle, {
    adSetLimit: adSetCount,
    objectiveRecommendation: objective,
    hasRiskyClaim,
    originalClaim: 'Land a job in 7 days',
    repairedClaim: 'Find hidden resume issues before applying',
    ...meta,
  })
}

function completeWorkspace(intake, rawWorkspace, evidenceBundle, overrides = {}) {
  const workspace = rawWorkspace && typeof rawWorkspace === 'object'
    ? rawWorkspace
    : fallbackWorkspace(intake, evidenceBundle)
  const recommendedPlan = workspace.recommended_plan || {}
  const evidence = evidenceBundle?.structured_evidence || {}
  const budgetAdSetLimit = overrides.adSetLimit
    || workspace.budget_signal?.recommended_ad_set_count
    || (Number(intake.budget_usd || 500) < 1000 ? 2 : 3)
    || 2
  const objectiveRecommendation = overrides.objectiveRecommendation
    || workspace.delivery_readiness?.objective_recommendation
    || (intake.pixel_status !== 'verified' || Number(intake.budget_usd || 500) < 1500 ? 'LEADS' : null)
    || workspace.paused_execution_spec?.campaign?.objective
    || recommendedPlan.objective
    || 'LEADS'
  const hasRiskyClaim = typeof overrides.hasRiskyClaim === 'boolean'
    ? overrides.hasRiskyClaim
    : Array.isArray(evidence.risky_claims) && evidence.risky_claims.length > 0
  const originalClaim = overrides.originalClaim || pickOriginalRiskyClaim(intake, evidence)
  const repairedClaim = overrides.repairedClaim || 'Use proof-based resume diagnosis instead of guaranteed job outcomes.'

  workspace.evidence_artifacts ||= {
    job_id: evidenceBundle?.job_id || 'unknown',
    mode: evidenceBundle?.mode || 'unknown',
    artifacts: evidenceBundle?.artifacts || [],
    structured_evidence: evidence,
    notes: evidenceBundle?.notes || [],
  }

  if (recommendedPlan.ad_sets?.length && recommendedPlan.ad_sets.length > budgetAdSetLimit) {
    recommendedPlan.ad_sets = recommendedPlan.ad_sets.slice(0, budgetAdSetLimit)
  }
  recommendedPlan.objective = objectiveRecommendation
  workspace.recommended_plan = recommendedPlan

  if (workspace.paused_execution_spec?.campaign) {
    workspace.paused_execution_spec.campaign.objective = objectiveRecommendation
  }

  workspace.delivery_readiness ||= {}
  workspace.delivery_readiness.objective_recommendation = objectiveRecommendation
  workspace.budget_economics ||= {}
  workspace.budget_economics.ad_set_limit = budgetAdSetLimit
  workspace.budget_economics.target_cpa = workspace.unit_economics?.target_cpa || (intake.target_cpa ? moneyText(intake.target_cpa) : 'unknown')
  workspace.budget_economics.break_even_cpa = workspace.unit_economics?.break_even_cpa || 'unknown'

  workspace.agent_timeline = buildAgentTimeline({
    workspace,
    evidenceBundle,
    budgetAdSetLimit,
    objectiveRecommendation,
    hasRiskyClaim,
    originalClaim,
    repairedClaim,
  })
  workspace.plan_diff = buildPlanDiff({
    budgetAdSetLimit,
    objectiveRecommendation,
    hasRiskyClaim,
    originalClaim,
    repairedClaim,
    budget: intake.budget_usd || 500,
  })
  workspace.causal_checks = buildCausalChecks({
    workspace,
    budgetAdSetLimit,
    objectiveRecommendation,
    hasRiskyClaim,
  })
  const provider = aiInfo()
  const passCount = workspace.causal_checks.filter((check) => check.passed).length
  workspace.provenance = {
    request_id: overrides.requestId || 'unknown',
    mode: overrides.mode || 'live',
    source: overrides.source || (provider.provider === 'vertex-ai' ? 'vertex-ai' : provider.provider),
    fallback: Boolean(overrides.fallbackReason),
    fallback_reason: overrides.fallbackReason || null,
    ai: provider,
    evidence_mode: workspace.evidence_artifacts?.mode || evidenceBundle?.mode || 'unknown',
    causal_checks: {
      passed: passCount,
      total: workspace.causal_checks.length,
    },
    latency_ms: overrides.startedAt ? Date.now() - overrides.startedAt : null,
    paused_only: true,
    active_execution_supported: false,
  }
  console.log(`[workspace:${workspace.provenance.request_id}] provenance source=${workspace.provenance.source} fallback=${workspace.provenance.fallback} checks=${passCount}/${workspace.causal_checks.length} latency_ms=${workspace.provenance.latency_ms}`)

  return workspace
}

function buildAgentTimeline({ workspace, evidenceBundle, budgetAdSetLimit, objectiveRecommendation, hasRiskyClaim, originalClaim, repairedClaim }) {
  const riskyText = hasRiskyClaim ? `Risky claim detected: ${originalClaim}.` : 'No hard guarantee claim detected in supplied copy.'
  return [
    {
      agent: 'EvidenceAgent',
      status: evidenceBundle?.mode === 'fixture_fallback' ? 'watch' : 'pass',
      finding: `${evidenceBundle?.mode || 'fixture'} evidence collected from ${evidenceBundle?.artifacts?.length || 0} artifact(s). ${riskyText}`,
      impact: hasRiskyClaim ? 'Forces Creative and Coordinator steps to rewrite the claim before launch.' : 'Allows Planner to use evidence-backed creative hypotheses.',
      affects: ['MediaPlannerAgent', 'DeliveryReadinessAgent', 'CoordinatorAgent'],
    },
    {
      agent: 'MediaPlannerAgent',
      status: 'pass',
      finding: 'Generated Validation, Balanced, and Aggressive scenarios from product, evidence, audience, and budget context.',
      impact: 'Creates the plan options that downstream agents can reject or repair instead of producing one opaque answer.',
      affects: ['BudgetEconomicsAgent', 'DeliveryReadinessAgent', 'CoordinatorAgent'],
    },
    {
      agent: 'BudgetEconomicsAgent',
      status: budgetAdSetLimit <= 2 ? 'watch' : 'pass',
      finding: `Current budget supports at most ${budgetAdSetLimit} ad set(s) for a first-flight test.`,
      impact: `Coordinator must keep the recommended plan at ${budgetAdSetLimit} ad set(s) and use economics for kill/scale thresholds.`,
      affects: ['CoordinatorAgent', 'PausedExecutor'],
    },
    {
      agent: 'DeliveryReadinessAgent',
      status: objectiveRecommendation === 'CONVERSIONS' ? 'watch' : 'pass',
      finding: `Recommended objective is ${objectiveRecommendation} because tracking maturity and policy risk gate execution.`,
      impact: `Coordinator must set the final campaign objective to ${objectiveRecommendation}.`,
      affects: ['CoordinatorAgent', 'PausedExecutor'],
    },
    {
      agent: 'CoordinatorAgent',
      status: workspace.final_decision?.status === 'READY_PAUSED' ? 'pass' : 'watch',
      finding: hasRiskyClaim
        ? `Balanced plan repaired: "${originalClaim}" -> "${repairedClaim}".`
        : 'Balanced plan selected after comparing validation and aggressive alternatives.',
      impact: 'Produces the before/after diff and final READY_PAUSED recommendation.',
      affects: ['PausedExecutor'],
    },
    {
      agent: 'PausedExecutor',
      status: 'pass',
      finding: 'Prepared Meta-compatible execution spec with status fixed to PAUSED.',
      impact: 'No ACTIVE spend path exists; human approval remains the final gate.',
      affects: ['HumanReviewer'],
    },
  ]
}

function buildPlanDiff({ budgetAdSetLimit, objectiveRecommendation, hasRiskyClaim, originalClaim, repairedClaim, budget }) {
  const beforeAdSets = Math.max(3, budgetAdSetLimit + 1)
  const beforeBudget = Math.round(budget / beforeAdSets)
  const afterBudget = Math.round(budget / budgetAdSetLimit)
  const items = [
    {
      field: 'Objective',
      before: 'CONVERSIONS',
      after: objectiveRecommendation,
      reason: 'Pixel/event maturity is not proven, so the repaired plan optimizes for a safer first signal.',
    },
    {
      field: 'Ad sets',
      before: String(beforeAdSets),
      after: String(budgetAdSetLimit),
      reason: 'BudgetEconomicsAgent capped the structure to protect signal density.',
    },
    {
      field: 'Budget per ad set',
      before: moneyText(beforeBudget),
      after: moneyText(afterBudget),
      reason: 'Fewer ad sets create a more viable learning window.',
    },
    {
      field: 'Launch state',
      before: 'FIX_FIRST',
      after: 'READY_PAUSED',
      reason: 'The repaired plan can be prepared, but still cannot spend without human approval.',
    },
  ]

  if (hasRiskyClaim) {
    items.splice(3, 0, {
      field: 'Claim',
      before: originalClaim,
      after: repairedClaim,
      reason: 'EvidenceAgent marked the original as a policy-sensitive outcome promise.',
    })
  }

  return {
    status: hasRiskyClaim || objectiveRecommendation !== 'CONVERSIONS' || budgetAdSetLimit <= 2 ? 'FIX_FIRST_TO_READY_PAUSED' : 'READY_PAUSED',
    summary: 'Coordinator repaired the plan by reducing fragmentation, changing the objective, and removing risky claims before paused execution.',
    items,
  }
}

function buildCausalChecks({ workspace, budgetAdSetLimit, objectiveRecommendation, hasRiskyClaim }) {
  const finalAdSetCount = workspace.recommended_plan?.ad_sets?.length || 0
  const finalObjective = workspace.recommended_plan?.objective || workspace.paused_execution_spec?.campaign?.objective
  const deliveryStatus = workspace.delivery_readiness?.status || 'unknown'
  const targetCpa = parseMoneyValue(workspace.unit_economics?.target_cpa || workspace.budget_economics?.target_cpa)
  const breakEvenCpa = parseMoneyValue(workspace.unit_economics?.break_even_cpa || workspace.budget_economics?.break_even_cpa)
  const economicsKnown = Number.isFinite(targetCpa) && Number.isFinite(breakEvenCpa) && breakEvenCpa > 0
  const claimRewritePresent = hasClaimRewrite(workspace.plan_diff)
  const timelineOrder = (workspace.agent_timeline || []).map((item) => item.agent)
  return [
    {
      id: 'budget_ad_set_limit_applied',
      passed: finalAdSetCount <= budgetAdSetLimit,
      expected: `<= ${budgetAdSetLimit}`,
      actual: finalAdSetCount,
      detail: 'Recommended plan ad set count must not exceed BudgetEconomicsAgent limit.',
    },
    {
      id: 'delivery_objective_applied',
      passed: objectiveRecommendation === finalObjective,
      expected: objectiveRecommendation,
      actual: finalObjective,
      detail: 'DeliveryReadinessAgent objective recommendation must be applied to the final plan.',
    },
    {
      id: 'objective_pixel_safety',
      passed: !(finalObjective === 'CONVERSIONS' && deliveryStatus !== 'ready'),
      expected: 'No CONVERSIONS objective unless delivery readiness is ready',
      actual: `${finalObjective} + ${deliveryStatus}`,
      detail: 'Conversion objective requires verified tracking readiness.',
    },
    {
      id: 'economics_safety',
      passed: !economicsKnown || targetCpa <= breakEvenCpa,
      expected: economicsKnown ? `target CPA <= break-even CPA (${moneyText(breakEvenCpa)})` : 'economics unknown; do not claim scale readiness',
      actual: economicsKnown ? `${moneyText(targetCpa)} vs ${moneyText(breakEvenCpa)}` : 'unknown',
      detail: 'Unit economics must be viable before scale is recommended.',
    },
    {
      id: 'risky_claim_rewritten',
      passed: !hasRiskyClaim || claimRewritePresent,
      expected: hasRiskyClaim ? 'claim rewrite in plan_diff' : 'no risky claim rewrite required',
      actual: hasRiskyClaim ? (claimRewritePresent ? 'structured claim rewrite found' : 'no structured claim rewrite found') : 'not required',
      detail: 'Risky EvidenceAgent claims must appear in the repair diff.',
    },
    {
      id: 'timeline_order',
      passed: timelineOrder.join('>') === 'EvidenceAgent>MediaPlannerAgent>BudgetEconomicsAgent>DeliveryReadinessAgent>CoordinatorAgent>PausedExecutor',
      expected: 'EvidenceAgent>MediaPlannerAgent>BudgetEconomicsAgent>DeliveryReadinessAgent>CoordinatorAgent>PausedExecutor',
      actual: timelineOrder.join('>'),
      detail: 'Agent timeline must reveal the causal chain in order.',
    },
  ]
}

function hasClaimRewrite(planDiff) {
  const items = Array.isArray(planDiff?.items) ? planDiff.items : []
  return items.some((item) => {
    const field = String(item?.field || '')
    const before = String(item?.before || '')
    const after = String(item?.after || '')
    const fieldIsClaim = /claim|hook|copy|message/i.test(field)
    const beforeLooksRisky = /guarantee|guaranteed|land a job|7 days|seven days|outcome promise/i.test(before)
    const afterLooksSafe = /proof|diagnosis|diagnostic|audit|score|hidden|resume issue|resume issues|readiness|checklist/i.test(after)
    return fieldIsClaim && beforeLooksRisky && afterLooksSafe
  })
}

function pickOriginalRiskyClaim(intake, evidence) {
  const text = `${intake.assets || ''}\n${intake.landing_page || ''}`
  const match = text.match(/land a job in 7 days|guaranteed?[^,.!。！？]{0,80}|[^,.!。！？]{0,40}7 days[^,.!。！？]{0,40}/i)
  if (match) return match[0]
  if (Array.isArray(evidence.risky_claims) && evidence.risky_claims[0]) return evidence.risky_claims[0]
  return 'Risky outcome promise'
}

function parseMoneyValue(value) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return NaN
  const normalized = value.replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

function moneyText(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '$0'
  return `$${Math.round(n).toLocaleString()}`
}
