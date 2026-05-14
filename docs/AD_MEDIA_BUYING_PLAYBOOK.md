# AdAudit Media Buying Playbook

This file captures the domain rules AdAudit uses for the hackathon demo. It is not copied into the product UI verbatim; it grounds the planner, simulator, auditors, and paused executor.

## Source-Inspired Patterns

Reviewed references:

- `goose-skills/meta-ads-campaign-builder`: intake, objective selection, campaign structure, audience strategy, copy framework, budget tiers.
- `goose-skills/competitor-ad-intelligence`: competitor ad evidence, hook clustering, format distribution, landing-page funnel teardown.
- `goose-skills/ad-to-landing-page-auditor`: promise continuity, language match, CTA alignment, conversion friction.
- `hoodini/ai-agents-skills/meta-ads`: Marketing API safety, dry-run before write, explicit confirmation, paused-by-default campaign creation.
- `toprank/meta-ads`: learning phase, creative fatigue, audience overlap, campaign structure, profitability math.
- `security-threat-model` and `security-best-practices`: trust boundaries, assets, blast radius, explicit mitigations.

## Product Principle

AdAudit is not a generic ad generator and not a one-line preflight checker.

It is a guarded media buying simulator:

1. Collect product, landing page, budget, objective, KPI priority, assets, and constraints.
2. Analyze the market and creative evidence.
3. Simulate several campaign options.
4. Rank the options by expected signal, risk, cost, and learning-phase viability.
5. Audit the recommended plan.
6. Prepare only paused execution objects.

## Intake Contract

Required:

- Product name or product description.
- Landing page URL or landing page notes.
- Platform, Meta first.
- Budget.
- Objective: leads, traffic, purchases, demos, app installs, awareness.
- KPI priority: CTR, CPC, CPM, CPA, ROAS, CVR, lead quality.
- Audience hypothesis.
- Creative assets or copy notes.
- Constraints: no outcome guarantees, geo limits, brand voice, special category risk.

Nice to have:

- Competitor names or screenshots.
- Pixel / CAPI status.
- Existing campaign metrics.
- AOV, margin, LTV, close rate.

## Simulation Rules

Always compare multiple options, not one plan:

- Cheapest validation test: lowest safe spend, higher-funnel signal, fewer ad sets.
- Balanced learning test: enough structure to learn without fragmenting budget.
- Aggressive conversion test: only viable with tracking proof and enough budget.

Each option must include:

- Objective.
- Campaign structure.
- Budget split.
- Expected signal.
- KPI expectation ranges.
- Main risk.
- Why it wins or loses.

## Core Meta Heuristics

- If pixel or recent conversion event volume is unknown, avoid conversion-first plans.
- Under $1000, keep ad set count low; signal density matters more than testing granularity.
- Meta learning phase needs roughly 50 optimization events per ad set per week.
- Budget changes above roughly 20 percent can destabilize learning.
- Frequency above 3.0 with rising CPM suggests creative/audience fatigue, not a budget problem.
- Special ad categories include employment, credit, housing, social/political issues, and some financial services.
- Outcome guarantees and unprovable claims are high-risk.
- Broad platform claims must be converted into proof-first creative hypotheses.

## Safety Protocol

Read operations are safe. Write operations touch money.

AdAudit v1 hackathon policy:

- No ACTIVE campaign creation.
- Any executor output must be PAUSED.
- Show impact before execution: budget, objective, ad set count, claims, special-category risk.
- Dry-run style output first.
- Never chain create to activate.
- Label mock executor clearly unless real Meta credentials are configured.

## Auditor Roles

- TrackingAuditor: pixel, CAPI, event volume, objective safety.
- AudienceAuditor: audience size, overlap, segmentation, learning-phase viability.
- BudgetAuditor: sample size, expected signal, CPA/CPC math.
- PolicyAuditor: special category, personal attributes, claim risk.
- CreativeLandingAuditor: hook quality, proof mechanism, message match, creative fatigue risk.

## Winning Demo Shape

The strongest demo is:

1. User enters a real campaign setup.
2. Agent simulates three media-buying options.
3. Agent proves why two options waste budget.
4. Agent recommends the cheapest viable test.
5. Auditor board validates the recommendation.
6. Executor prepares paused campaign IDs only.

The climax is not refusal by itself. The climax is a defensible buying decision.
