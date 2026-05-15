import { buildCausalChecks, completeWorkspace } from './agents.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function baseWorkspace() {
  return {
    recommended_plan: {
      objective: 'CONVERSIONS',
      ad_sets: [
        { name: 'A', budget_usd: 100 },
        { name: 'B', budget_usd: 100 },
        { name: 'C', budget_usd: 100 },
      ],
    },
    paused_execution_spec: {
      campaign: {
        name: 'Test campaign',
        objective: 'CONVERSIONS',
        status: 'PAUSED',
      },
    },
    delivery_readiness: {
      status: 'watch',
    },
    unit_economics: {
      target_cpa: '$35',
      break_even_cpa: '$72',
    },
    final_decision: {
      status: 'READY_PAUSED',
    },
  }
}

function testCompleteWorkspaceRepairsPlan() {
  const workspace = completeWorkspace(
    {
      product: 'AI Resume Optimizer',
      budget_usd: 500,
      target_cpa: 35,
      landing_page: 'Land a job in 7 days with our AI resume tool.',
      assets: 'Land a job in 7 days',
      pixel_status: 'unknown',
    },
    baseWorkspace(),
    {
      job_id: 'unit_ev',
      mode: 'fixture',
      artifacts: [],
      structured_evidence: {
        risky_claims: ['time-bound or guaranteed employment outcome claim'],
      },
    },
    {
      requestId: 'unit_guardrails',
      adSetLimit: 2,
      objectiveRecommendation: 'LEADS',
      mode: 'unit',
      source: 'unit-test',
    },
  )

  assert(workspace.recommended_plan.ad_sets.length === 2, 'completeWorkspace should trim ad sets to budget limit')
  assert(workspace.recommended_plan.objective === 'LEADS', 'completeWorkspace should override recommended objective')
  assert(workspace.paused_execution_spec.campaign.objective === 'LEADS', 'completeWorkspace should sync paused campaign objective')
  assert(workspace.plan_diff.items.some((item) => item.field === 'Claim'), 'completeWorkspace should add risky claim diff')
  assert(workspace.causal_checks.every((check) => check.passed), 'completeWorkspace should produce passing causal checks after repairs')
  assert(workspace.provenance.causal_checks.passed === workspace.causal_checks.length, 'provenance should summarize causal check pass count')
}

function testBuildCausalChecksDetectsFailures() {
  const checks = buildCausalChecks({
    budgetAdSetLimit: 2,
    objectiveRecommendation: 'LEADS',
    hasRiskyClaim: true,
    workspace: {
      recommended_plan: {
        objective: 'CONVERSIONS',
        ad_sets: [{}, {}, {}],
      },
      paused_execution_spec: {
        campaign: { objective: 'CONVERSIONS' },
      },
      delivery_readiness: {
        status: 'watch',
      },
      unit_economics: {
        target_cpa: '$90',
        break_even_cpa: '$72',
      },
      plan_diff: {
        items: [
          {
            field: 'Ad sets',
            before: '3',
            after: '2',
          },
        ],
      },
      agent_timeline: [
        { agent: 'EvidenceAgent' },
        { agent: 'BudgetEconomicsAgent' },
        { agent: 'MediaPlannerAgent' },
        { agent: 'DeliveryReadinessAgent' },
        { agent: 'CoordinatorAgent' },
        { agent: 'PausedExecutor' },
      ],
    },
  })

  const byId = Object.fromEntries(checks.map((check) => [check.id, check]))
  assert(byId.budget_ad_set_limit_applied.passed === false, 'detects ad set limit violation')
  assert(byId.delivery_objective_applied.passed === false, 'detects objective mismatch')
  assert(byId.objective_pixel_safety.passed === false, 'detects unsafe conversion objective')
  assert(byId.economics_safety.passed === false, 'detects unsafe target CPA')
  assert(byId.risky_claim_rewritten.passed === false, 'detects missing claim rewrite')
  assert(byId.timeline_order.passed === false, 'detects incorrect timeline order')
}

function testBuildCausalChecksPassesValidWorkspace() {
  const checks = buildCausalChecks({
    budgetAdSetLimit: 2,
    objectiveRecommendation: 'LEADS',
    hasRiskyClaim: true,
    workspace: {
      recommended_plan: {
        objective: 'LEADS',
        ad_sets: [{}, {}],
      },
      paused_execution_spec: {
        campaign: { objective: 'LEADS' },
      },
      delivery_readiness: {
        status: 'watch',
      },
      unit_economics: {
        target_cpa: '$35',
        break_even_cpa: '$72',
      },
      plan_diff: {
        items: [
          {
            field: 'Claim',
            before: 'Land a job in 7 days',
            after: 'Find hidden resume issues before applying',
          },
        ],
      },
      agent_timeline: [
        { agent: 'EvidenceAgent' },
        { agent: 'MediaPlannerAgent' },
        { agent: 'BudgetEconomicsAgent' },
        { agent: 'DeliveryReadinessAgent' },
        { agent: 'CoordinatorAgent' },
        { agent: 'PausedExecutor' },
      ],
    },
  })

  assert(checks.every((check) => check.passed), 'valid workspace should pass every causal check')
}

testCompleteWorkspaceRepairsPlan()
testBuildCausalChecksDetectsFailures()
testBuildCausalChecksPassesValidWorkspace()

console.log('workspace guardrail unit tests passed')
