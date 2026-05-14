# AdAudit

> **AdAudit is a guarded AI media buyer. It simulates the media buy, compares campaign options, recommends the cheapest viable Meta test, and prepares only paused execution.**

Most AI ad tools stop at creative generation or rush toward launch. AdAudit works like a small media buying team: it collects product and budget context, builds a deterministic media plan, asks Gemini for a live strategy overlay, compares risk and signal quality, checks causal guardrails in code, and outputs a Meta-compatible `PAUSED` campaign spec for human approval.

Built for **AI Agent Olympics Milan 2026**.

## Why This Matters

AI can now operate ad tools. That does not mean enterprises want an agent that spends money automatically. The useful agent is the one that can explain:

- which campaign structure is worth testing first,
- why the cheaper plan can beat the aggressive plan,
- when conversion optimization is unsafe because tracking is not ready,
- which creative hypotheses are testable instead of just catchy,
- what must stay paused until a human approves the spend.

AdAudit turns that judgment into a working web app.

## Product Flow

1. **Campaign Intake**  
   User enters product, landing page notes, platform, budget, objective, KPI priority, audience, available assets, competitors, constraints, and pixel status.

2. **Research Evidence**  
   The system extracts useful evidence from landing page notes, competitor names, asset descriptions, and Gemini-style multimodal analysis when configured. The verified public demo uses stable fixture evidence while Gemini performs live strategy reasoning over that evidence.

3. **Live Gemini Strategy Overlay**  
   Gemini on Vertex AI adds a short strategy note covering evidence, creative direction, risk, and the paused-launch decision. The backend wraps this note into the product workspace instead of trusting Gemini to produce the full execution object.

4. **Media Simulation**  
   The workspace compares three options:

   - cheapest validation test,
   - balanced learning test,
   - aggressive conversion test.

   Each option includes objective, budget, campaign structure, expected signal, KPI ranges, and why it should or should not be chosen.

5. **Recommendation**  
   AdAudit selects the best plan and explains why the alternatives lose.

6. **Guardrail Review**  
   Five specialist auditors review the recommendation:

   - `TrackingAuditor`
   - `AudienceAuditor`
   - `BudgetAuditor`
   - `PolicyAuditor`
   - `CreativeLandingAuditor`

7. **Paused Execution Spec**  
   The executor creates Meta-compatible IDs only for `PAUSED` objects. There is no `ACTIVE` creation path in the demo.

## Demo Moment

The strongest demo is not "the agent says no." It is:

> The agent compares three media-buying strategies, chooses the cheapest viable test, proves why the aggressive plan wastes money, then prepares a paused launch spec with guardrails.

For the default AI resume optimizer brief, AdAudit recommends a balanced or validation-first Meta test, excludes risky employment-outcome claims, and keeps execution paused until tracking and creative review are complete.

## API

The Node server serves the React app and the agent API:

- `GET /api/health`
- `GET /api/agents`
- `POST /api/brief/parse`
- `POST /api/plan/generate`
- `POST /api/workspace/analyze`
- `POST /api/preflight/run` legacy preflight visualization
- `POST /api/preflight/stream` legacy preflight visualization
- `POST /api/campaign/fix`
- `POST /api/campaign/execute`

Primary v2 route:

```bash
curl -X POST http://localhost:8080/api/workspace/analyze \
  -H "content-type: application/json" \
  -d '{
    "product":"AI Resume Optimizer",
    "budget_usd":500,
    "objective":"Lead generation",
    "audience":"US early-career job seekers",
    "pixel_status":"unknown"
  }'
```

For reliable video recording, the same route supports `demo_mode: true`, which uses the built-in media-buying playbook instantly while preserving the same response schema.

Verified production route:

- Public demo URL: [http://95.179.162.188:8080](http://95.179.162.188:8080)
- Main path: `POST /api/workspace/analyze`
- AI mode: Google Vertex AI / Gemini 2.5 Flash through Application Default Credentials
- Stable architecture: deterministic guarded workspace + live Gemini plain-text strategy overlay + programmatic causal checks

The older `/api/preflight/*` endpoints are retained as legacy auditor visualizations. They are not the canonical submission path.

## Local Development

```bash
npm install
npm run dev
```

Production-style local run:

```bash
npm run build
npm start
```

Open [http://localhost:8080](http://localhost:8080).

## Environment

```bash
PORT=8080
AI_BASE_URL=https://your-openai-compatible-provider/v1
AI_API_KEY=...
AI_MODEL=...
META_EXECUTOR_MODE=mock
ADAUDIT_FAST_WORKSPACE=false

# Gemini through Vertex AI + Application Default Credentials.
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-2.5-flash
ADAUDIT_DISABLE_LIVE_EVIDENCE=true
```

The AI client supports two provider modes:

- OpenAI-compatible chat completions for DeepSeek gateway, OpenRouter, Vultr Serverless Inference, or OpenAI.
- Gemini on Vertex AI through Application Default Credentials, matching the Google Cloud hackathon flow where API keys are disallowed.

For the verified Google Cloud path, see [GOOGLE_VERTEX_SETUP.md](GOOGLE_VERTEX_SETUP.md). The deployed Vultr instance uses ADC, not a Gemini API key.

## Vultr Deployment

AdAudit is designed as one deployable web service:

```bash
npm ci
npm run build
PORT=8080 npm start
```

For the Vultr Award, deploy the Node backend and React build on a Vultr VM. See [VULTR_DEPLOYMENT.md](VULTR_DEPLOYMENT.md).

Verified deployment:

- Vultr VM: Ubuntu 24.04, Frankfurt, shared CPU 1 GB
- Process manager: PM2 app `adaudit`
- Public URL: [http://95.179.162.188:8080](http://95.179.162.188:8080)
- Health: [http://95.179.162.188:8080/api/health](http://95.179.162.188:8080/api/health)

## Competition Fit

Primary target: **Vultr Award**

Strong category fit:

- **Enterprise Utility**: media buying is a measurable business workflow.
- **Agentic Workflows**: intake, evidence, simulation, recommendation, audit, execution spec.
- **Collaborative Systems**: separate evidence, media-planning, economics, readiness, coordinator, and executor roles are shown in the workspace timeline.
- **Multimodal Intelligence / Gemini**: Gemini adds live evidence/creative/risk reasoning through the strategy overlay; screenshot evidence support remains available behind the stable demo path.

## Safety Boundaries

- No real ad spend in the demo.
- All execution objects are `PAUSED`.
- No backend route creates an `ACTIVE` campaign.
- The mock executor is labeled as dry-run shaped Meta output.
- No fake ROAS winner prediction.
- No claim to be the first Meta CLI agent.
- Human approval is required before any real platform activation.
- Live Gemini reasoning is separated from execution safety; code-level causal checks decide whether the final workspace is coherent.

## Verification

```bash
npm run lint
npm run build
```

Smoke test:

```bash
curl http://localhost:8080/api/health
curl -X POST http://localhost:8080/api/workspace/analyze \
  -H "content-type: application/json" \
  -d '{"product":"AI Resume Optimizer","budget_usd":500,"demo_mode":true}'
```

Live Gemini evidence in PM2 logs should include:

```text
ai_overlay text_preview="Evidence: ..."
provenance source=vertex-ai-text-overlay fallback=false checks=6/6
ai_overlay success decision=READY_PAUSED
```
