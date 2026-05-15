# AdAudit — Hackathon Submission

## Project Title

**AdAudit · Guarded AI Media Buyer**

## Tagline

The AI media buyer that audits before it spends.

## Short Description (≤ 180 chars)

A guarded AI media buyer. AdAudit reads your brief, runs live agent tools (Vertex AI, Gemini Vision, Nano Banana, knowledge retrieval), compares three plans, and prepares only paused launches.

## Long Description

Most AI marketing tools help teams produce more ads, faster. AdAudit does the opposite — it is a guarded media-buying agent that refuses to launch a campaign when the brief, creative, or economics will waste budget.

A user enters product context, budget, target CPA, AOV, gross margin, audience, landing page, and a creative. AdAudit then runs a live workflow on a Vultr VM:

1. **EvidenceAgent** opens the landing page (or simulates landing-page semantics), pulls category patterns, and routes Gemini Vision over the creative. Real `tool_call_start` / `tool_call_done` events stream over SSE for every step.
2. **KnowledgeAgent** retrieves paid-media playbooks (platform selection, budget signal & unit economics, creative hypothesis, policy risk, multimodal review, vertical patterns) and feeds them into the agent prompts so Gemini does not reason naked.
3. **MediaPlannerAgent** compares three plans: a cheap validation, a balanced lead-gen, and an aggressive conversion test. Each plan has objective, budget split, signal expectation, and a viability comment.
4. **BudgetEconomicsAgent** uses CPC bands, learning-phase thresholds, and target CPA to compute a viable ad-set count and per-set budget. The result is a hard limit the LLM cannot exceed.
5. **DeliveryReadinessAgent** validates objective vs. pixel maturity, special-category rules, and inventory placement.
6. **CoordinatorAgent** picks one plan, rewrites risky claims into proof-based language, and records why the rejected plans lose.
7. **Six program-level causal guardrails** then run as code assertions: budget ad-set limit applied, objective/pixel safety, unit economics safety, risky claim rewritten, delivery objective applied, timeline causal order. The plan cannot reach `READY_PAUSED` until all six pass.
8. **PausedExecutor** outputs a Meta-compatible campaign object whose status is fixed to `PAUSED`. There is no active-spend code path anywhere in the system.

In parallel, when a creative is uploaded, `gemini-2.5-flash` runs multimodal Vision on the actual image and returns structured findings with region coordinates. `gemini-2.5-flash-image` (Nano Banana) then takes the image plus findings and produces an annotated version where the risky elements are circled directly on the creative. Both artifacts surface in the verdict UI through dedicated SSE events.

The default sample brief is an AI resume optimizer with a $500 Meta budget and a deliberately risky claim ("land a job in 7 days"). AdAudit refuses an aggressive conversion test because the pixel is cold and the budget cannot fragment safely. It rewrites the claim into a proof-based hook. It collapses three ad sets to two. It outputs a paused campaign spec, six of six guardrails passing, and a human-approval gate.

## What Makes It Different

- **Live-only execution.** Every request triggers real Vertex AI reasoning, real knowledge retrieval, real Gemini Vision, real program-level guardrails. There is no fixture mode that could be mistaken for real work.
- **LLM proposes, code enforces.** The agent can recommend a plan, but six deterministic assertions can override it. The brake is in code, not in a prompt.
- **Multimodal that is visible.** Gemini Vision and Nano Banana run on the uploaded creative; the verdict UI shows the annotated image alongside the textual findings, with the `gemini-2.5-flash · vertex-ai · adc` watermark embedded.
- **A consultancy-grade deliverable.** The verdict is a campaign package — paused execution spec, before/after diff, scenario comparison, agent handoff timeline, knowledge packs cited — not a chat reply.
- **Paused-only executor.** Active spend has no code path. Human approval is a structural requirement, not a UX flag.

## Architecture (High Level)

```
Intake (React, Fraunces + Inter design system)
  ↓
POST /api/workspace/stream (SSE, no fixture mode)
  ↓
emitWorkspaceTrace (Node 24)
  ├── EvidenceAgent       → browser.fetch · competitor.search · vision.analyze
  │      ├─ if creative present: gemini-2.5-flash multimodal Vision (real image input)
  │      └─ if Vision findings: gemini-2.5-flash-image (Nano Banana) annotation pass
  ├── KnowledgeAgent      → knowledge.search across 7 paid-media playbooks
  ├── MediaPlannerAgent   → 3-scenario media plan
  ├── BudgetEconomicsAgent → math.compute (CPC × budget × ad-set fit)
  ├── DeliveryReadinessAgent → policy.lookup · objective × pixel × placement
  ├── CoordinatorAgent    → claim rewrite + plan selection
  ├── 6 causal guardrails → audit.score (program assertions)
  └── PausedExecutor      → Meta-compatible campaign object · status PAUSED
  ↓
SSE events: stage_start · tool_call_start / done / error · browser_open / close ·
            evidence_arrived · vision_result_arrived · vision_annotated_arrived ·
            workspace_done
  ↓
Frontend renders: agent operations floor · live tool list · evidence panel ·
                  browser cameo overlay · verdict hero (Fraunces italic display) ·
                  GEMINI VISION card with LIVE pulse · reliability panel ·
                  3-scenario comparison · before/after diff · agent timeline ·
                  6/6 causal guardrails sidebar · paused launch spec.
```

## Sponsor Fit

### Vultr Award — Best Use of Vultr

AdAudit is a web-based enterprise agent deployed on a Vultr VM (Ubuntu 24.04 LTS, Frankfurt region, PM2 process supervisor with systemd autostart). The Vultr VM is the central system of record for intake, agent orchestration, tool execution, knowledge retrieval, guardrail evaluation, and paused launch construction. Frontend build and Node backend both ship from the same Vultr instance. Public demo URL: **<http://95.179.162.188:8080>**.

### Google / Gemini Award — Best Use of Gemini

- **gemini-2.5-flash** powers the workspace reasoning, the strategy overlay, and the multimodal Vision call against uploaded creatives.
- **gemini-2.5-flash-image (Nano Banana)** runs an image-in / image-out pass to annotate the creative directly with editorial marks at the regions Vision flagged.
- **Vertex AI via Application Default Credentials (ADC)** — enterprise authentication mode rather than an API key. The footer of every Gemini-rendered surface carries the `gemini-2.5-flash · vertex-ai · adc` watermark.
- Gemini is **not** used naked. KnowledgeAgent snippets, EvidenceAgent findings, budget math, and platform rules are concatenated into the prompt so Gemini operates inside a harness, not as a chat partner.

### Enterprise Utility

The target is real: marketing teams routinely waste budget on campaigns that fail Meta policy, run with cold pixels, fragment too thinly across ad sets, or chase outcome-promise claims that get rejected. AdAudit produces a paused campaign package that a senior buyer can hand to a CMO without redoing the math.

### Collaborative Systems

Eight named agents and tools coordinate in a strict causal chain (Evidence → Knowledge → MediaPlanner → BudgetEconomics → DeliveryReadiness → Coordinator → Guardrails → PausedExecutor). The handoff is visible in the UI as a numbered timeline. The Coordinator records the rationale for the rejected plans rather than producing one opaque answer.

### Multimodal Intelligence

Two Gemini multimodal calls run on every brief that uploads a creative: a text-output Vision call that returns structured findings with region coordinates, and an image-output Nano Banana call that produces the annotated artifact. Both are visible in the verdict UI.

## Categories & Tags

`Enterprise Utility` · `Agentic Workflows` · `Collaborative Systems` · `Multimodal Intelligence` · `Gemini` · `Vertex AI` · `Vultr` · `Meta Ads` · `Media Buying` · `Marketing Automation` · `Nano Banana`

## Live Verification — How a Judge Can Confirm This Is Real

1. Open <http://95.179.162.188:8080>
2. Click **Load risky sample brief** (or type any product + budget + claim).
3. (Optional) Drag any ad image into the creative upload zone.
4. Click **Run guarded media plan**.
5. Watch the tool calls stream in (~15-25 seconds). Each row in the live tool list shows the actual tool name, duration in ms, HTTP status, and a chevron to expand the full input/output payload.
6. After the verdict appears, scroll. The Reliability Panel ("Why this verdict is reliable") summarizes the five evidence sources. The Causal Guardrails sidebar shows 6 / 6 PASS with the rule name for each assertion.
7. The Gemini Vision card displays the uploaded creative. When a creative was attached, the annotated version produced by Nano Banana replaces the plain thumbnail and the `LIVE` pill animates.

The system has no fixture mode. Every run is real.

## Submission Checklist

- ✅ Public GitHub repository: <https://github.com/calebguo007/adaudit-meta-preflight>
- ✅ Vultr VM deployment with PM2 + systemd autostart
- ✅ Public demo URL: <http://95.179.162.188:8080>
- ✅ Gemini Vertex AI integration (ADC, not API key)
- ✅ Nano Banana multimodal annotation pipeline
- ✅ Six program-level causal guardrails (unit tests included)
- ✅ KnowledgeAgent with 7 paid-media playbooks
- ⬜ Video presentation: see `docs/VIDEO_SCRIPT.md` for the 2:00 recording script
- ⬜ Slide deck: see `docs/SLIDES.md`
- ⬜ Cover image: capture frame 0:58 of the demo video (Verdict first viewport)

## License

MIT.
