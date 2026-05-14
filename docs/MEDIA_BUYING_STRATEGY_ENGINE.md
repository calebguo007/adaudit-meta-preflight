# Media Buying Strategy Engine

AdAudit's core value is not creative generation. It is media buying judgment:

- what to test,
- how much to spend,
- what signal the platform can realistically learn from,
- when to kill,
- when to scale,
- and what must stay paused until a human approves.

This document converts the reviewed advertising skills and product strategy notes into implementation-safe heuristics for the hackathon app. It intentionally avoids company-specific data and keeps the logic platform-general with Meta as the first supported platform.

## Agent Architecture

AdAudit follows a coordinator-and-specialists pattern inspired by Claude Code and Codex agent workflows:

1. **Planner proposes** multiple paths, not one answer.
2. **Specialists judge** the proposal from different professional lenses.
3. **Coordinator synthesizes** tradeoffs into a recommendation.
4. **Executor is constrained** and cannot create active spend.

This matters because media buying mistakes usually come from collapsed context: a creative idea may be strong, but the tracking is weak; an audience may be attractive, but the budget cannot support the split; a high-CTR format may lower downstream lead quality.

## Specialist Roles

### MarketResearchAgent

Purpose: turn competitor ads, landing page notes, and user-provided market context into evidence.

Outputs:

- category hook patterns,
- competitor positioning bets,
- visible proof mechanisms,
- risky or crowded claims,
- landing page message-match notes,
- creative white space.

### DeliveryReadinessAgent

Purpose: answer "can this campaign actually run and learn?"

Checks:

- pixel / event readiness,
- landing page availability and message match,
- policy-sensitive claims,
- creative format suitability,
- campaign naming and paused execution.

Principle: delivery readiness is upstream of optimization. If the platform cannot observe the target event, the campaign should optimize to an earlier signal.

### BudgetSignalAgent

Purpose: protect signal density.

Checks:

- budget per ad set,
- expected optimization events per week,
- whether the target event is too deep for the current spend,
- whether the plan fragments budget across too many ad sets or creatives.

Rules:

- Small budgets should test fewer ad sets.
- Conversion-first plans require verified tracking and enough event volume.
- Learning-phase protection is a strategy constraint, not a UI warning.

### AudienceStrategyAgent

Purpose: choose how much control the advertiser gives the platform.

Modes:

- broad / automated: best when signal quality is good and the audience is large enough,
- interest-led: useful for early validation when product category is specific,
- retargeting: useful only when warm pools exist,
- lookalike: useful only when there is a high-quality seed.

Principle: do not over-target to create false precision. On Meta, fragmented audiences often hurt learning more than they help targeting.

### CreativeStrategyAgent

Purpose: judge which creative hypotheses are worth testing.

Checks:

- hook clarity,
- proof mechanism,
- message match,
- platform fit,
- policy risk,
- expected metric: CTR, lead-form completion, LPV, CVR.

Principle: creative hypotheses are not final ads. They are testable bets.

### UnitEconomicsAgent

Purpose: convert media metrics into business risk.

Inputs when available:

- AOV,
- gross margin,
- lead-to-customer rate,
- LTV,
- target CPA or ROAS.

Outputs:

- break-even CPA / ROAS,
- maximum test CPA,
- confidence level,
- missing data warnings.

Principle: if economics are missing, estimates must be labeled as estimates and must not be used as hard launch gates.

### MediaBuyerCoordinator

Purpose: recommend one plan and explain the tradeoff.

Must output:

- recommended scenario,
- why it wins,
- why the other scenarios lose,
- kill thresholds,
- scale thresholds,
- 72-hour monitoring plan,
- paused execution spec.

## Strategy Heuristics

### Objective Selection

- Unknown pixel or no conversion event history -> use Traffic, Landing Page Views, or Leads.
- Verified pixel + enough event volume -> Conversions can be considered.
- Lead-gen with low budget -> prefer in-platform forms or high-volume lead objective before website conversions.
- Awareness is valid only when the user explicitly values reach or category education.

### Campaign Structure

- Under $1,000 first-flight budget -> 1-2 ad sets maximum.
- Do not split campaigns by creative format unless there is a measurement reason.
- Do not split campaigns by placement unless there is evidence that placement economics differ materially.
- Prefer one clean prospecting campaign over several tiny campaigns.
- Retargeting needs an actual warm pool; otherwise it is a fake line item.

### Budget Rules

- Protect budget density before test variety.
- A plan that tests too many hypotheses with too little spend is not "rigorous"; it is underpowered.
- Scaling should be staged. Large budget jumps can trigger relearning and noisy performance.
- Use conservative, moderate, aggressive scenarios rather than one linear forecast.

### Creative Rules

- Prioritize proof-first hooks over unsupported outcome promises.
- A hook that raises CTR but lowers lead quality should be treated as risky.
- Static, video, and landing page variants are delivery inventory choices, not only design choices.
- For policy-sensitive verticals, safer proof mechanisms beat stronger claims.

### Kill / Scale Rules

Default first-flight rules:

- **Kill** if spend reaches 2.5-3x target CPA with no qualified lead or conversion signal.
- **Kill** if CTR is below the plan's lower bound and CPC is above the upper bound after sufficient impressions.
- **Hold** if learning data is too sparse; do not overreact to the first few clicks.
- **Scale** only after the plan clears both efficiency and quality signals.
- **Scale gradually** unless the user explicitly accepts learning-phase reset risk.

### Monitoring Plan

First 72 hours:

1. Confirm delivery starts and the campaign is not policy-limited.
2. Confirm tracking events fire.
3. Watch CPM and CTR to identify auction fit.
4. Watch CPC and LPV rate to identify click quality.
5. Watch lead completion or conversion proxy only after enough volume.

Day 4-7:

1. Kill underpowered or off-message creatives.
2. Keep the recommended plan if signal is within expected range.
3. Avoid major structure edits unless the plan is clearly broken.

## Demo Implication

The winning demo should not stop at "Gemini analyzed a screenshot." It should show:

1. Gemini evidence,
2. three media plans,
3. why one wins,
4. what the agent will monitor,
5. when it would kill or scale,
6. and why execution is prepared as paused.
