# AdAudit

> Most AI ad tools help you launch faster. **AdAudit tells you when not to launch.**

AdAudit is a guardrailed multi-agent preflight system for Meta campaign launches. It audits a campaign brief before any spend can happen, refuses risky launches, drafts safer fixes, and only creates paused campaign objects after the plan passes review.

Built for AI Agent Olympics Milan 2026.

## Why it matters

AI agents can now operate ad platforms. That is useful only if they also know when to stop. AdAudit is designed for enterprise marketing teams that need autonomous execution with CFO-safe brakes:

- Detect structurally broken campaign briefs before budget is wasted.
- Explain the decision through specialized auditor agents, not a black-box score.
- Use Gemini-style competitor ad evidence to ground creative recommendations.
- Create Meta campaigns as `PAUSED` by default, requiring a human go-ahead before spend.

## Demo flow

1. **Brief**: input a risky Meta campaign brief.
2. **Evidence**: analyze competitor ad patterns and Ad Library-style samples.
3. **Audit Board**: five auditor agents review tracking, audience, policy, budget, and creative risks.
4. **Paused Launch**: after fixes, create a paused campaign through a Meta-compatible executor.

The demo climax is the refusal:

> HOLD: I will not launch this campaign yet.

## Agents

- `PixelAuditor`: conversion signal and tracking readiness.
- `AudienceAuditor`: audience size, overlap, fragmentation, and learning-phase risk.
- `PolicyAuditor`: Meta policy risk and sensitive claims.
- `BudgetAuditor`: sample-size math, CPM/CPC assumptions, and budget structure.
- `CreativeAuditor`: Gemini + Ad Library-style hook evidence.
- `Coordinator`: final `HOLD`, `FIX_FIRST`, or `READY_PAUSED` decision.

## API

The included Node server exposes the hackathon API contract:

- `POST /api/brief/parse`
- `POST /api/evidence/analyze`
- `POST /api/preflight/run`
- `POST /api/campaign/fix`
- `POST /api/campaign/execute`
- `GET /api/health`

The default executor is a Meta-compatible mock fallback. Wire the real Meta Ads CLI/MCP path behind `/api/campaign/execute` by setting `META_EXECUTOR_MODE=real` and replacing the mock command adapter in `server/index.mjs`.

## Local development

```bash
npm install
npm run dev
```

Production-style local run:

```bash
npm run build
npm start
```

Then open `http://localhost:8080`.

## Vultr deployment

AdAudit is intentionally deployable as a single web service:

```bash
npm ci
npm run build
PORT=8080 npm start
```

For Vultr, use the included `Dockerfile` or run it directly on a Node 24 instance. See `VULTR_DEPLOYMENT.md`.

## Competition positioning

Primary target: **Vultr Award**

Primary category: **Enterprise Utility**

Secondary category: **Collaborative Systems**

Sponsor alignment:

- **Vultr**: hosted enterprise web agent backend.
- **Gemini**: multimodal competitor ad analysis and creative evidence.
- **Meta Ads AI Connectors / CLI**: paused campaign executor path.

## Safety boundaries

- No real money spend in the demo.
- Campaigns are `PAUSED` by default.
- No claim to be the first Meta CLI agent.
- No fake statistical winner selection from CSV.
- The mock executor is explicitly labeled in UI and API responses.
