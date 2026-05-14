// AdAudit agent definitions and orchestration.
//
// Each auditor is a specialist with a tight scope. The Coordinator merges
// their findings. The Planner produces a media buying plan from a raw goal.
// The Fixer revises a plan that failed audit.
//
// All agents return JSON in a consistent shape so the UI can render uniformly.

import { callAgent, streamAgent } from './ai.mjs'

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

Use these paid-social rules:
- If pixel or recent conversion volume is unknown, avoid conversion-first plans.
- Under $1000, keep ad set count low; signal density matters more than testing granularity.
- Meta learning phase needs roughly 50 optimization events per ad set per week.
- Special ad categories include employment, credit, housing, social/political issues, and some financial services.
- Outcome guarantees and unprovable claims are high risk.
- Frequency >3.0 with rising CPM suggests creative/audience fatigue, not a budget problem.
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
  const userMsg = `Brief to audit:\n"""\n${brief}\n"""`
  const results = await Promise.all(
    AUDITORS.map(async (a) => {
      try {
        const report = await callAgent({ system: a.system, user: userMsg, json: true, maxTokens: 400 })
        return { auditor: a.name, id: a.id, ...(report || fallbackReport(a.name)) }
      } catch (err) {
        return { auditor: a.name, id: a.id, ...fallbackReport(a.name, err.message) }
      }
    })
  )
  return results
}

/**
 * Synthesize 5 reports into a final coordinator decision.
 */
export async function runCoordinator(brief, reports) {
  const userMsg = `Brief:\n"""${brief}"""\n\nAuditor reports:\n${JSON.stringify(reports, null, 2)}`
  const decision = await callAgent({ system: COORDINATOR_SYSTEM, user: userMsg, json: true, maxTokens: 400 })
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
  const normalized = normalizeIntake(intake)
  if (intake?.demo_mode || process.env.ADAUDIT_FAST_WORKSPACE === 'true') {
    return fallbackWorkspace(normalized)
  }
  const userMsg = `Campaign intake:\n${JSON.stringify(normalized, null, 2)}`
  try {
    const result = await callAgent({
      system: MEDIA_BUYER_WORKSPACE_SYSTEM,
      user: userMsg,
      json: true,
      maxTokens: 2200,
    })
    return result || fallbackWorkspace(normalized)
  } catch {
    return fallbackWorkspace(normalized)
  }
}

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
    maxTokens: 400,
    onChunk: (delta) => onChunk({ agent: a.name, delta }),
  })
  try {
    return { auditor: a.name, id: a.id, ...JSON.parse(full) }
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
  return {
    product: String(intake.product || 'AI resume optimizer'),
    product_url: String(intake.product_url || ''),
    landing_page: String(intake.landing_page || intake.landing_page_notes || ''),
    platform: 'Meta',
    budget_usd: Number.isFinite(budget) ? budget : 500,
    objective: String(intake.objective || 'leads'),
    kpi_priority: Array.isArray(intake.kpi_priority) ? intake.kpi_priority : ['CPA', 'CTR', 'CPC'],
    audience: String(intake.audience || 'US early-career job seekers'),
    assets: String(intake.assets || ''),
    competitors: String(intake.competitors || ''),
    constraints: String(intake.constraints || 'Avoid guaranteed employment outcomes. No automatic spend.'),
    pixel_status: String(intake.pixel_status || 'unknown'),
  }
}

function fallbackWorkspace(intake) {
  const budget = intake.budget_usd || 500
  const isSmallBudget = budget < 1000
  const objective = intake.pixel_status === 'verified' && budget >= 1500 ? 'CONVERSIONS' : 'LEADS'
  const campaignName = `PROS - ${intake.product.slice(0, 28)} - US - ${objective} - v0526`

  return {
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
}
