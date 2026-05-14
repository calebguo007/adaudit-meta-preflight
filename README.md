# AdAudit

> **AdAudit is a guarded AI media buyer. It simulates the media buy, compares campaign options, recommends the cheapest viable Meta test, and prepares only paused execution.**

Most AI ad tools stop at creative generation or rush toward launch. AdAudit works like a small media buying team: it collects product and budget context, researches evidence, simulates campaign structures, compares risk and signal quality, chooses the best plan, audits the recommendation, and outputs a Meta-compatible `PAUSED` campaign spec for human approval.

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
   The system extracts useful evidence from landing page notes, competitor names, asset descriptions, and Gemini-style multimodal analysis when configured.

3. **Media Simulation**  
   The workspace compares three options:

   - cheapest validation test,
   - balanced learning test,
   - aggressive conversion test.

   Each option includes objective, budget, campaign structure, expected signal, KPI ranges, and why it should or should not be chosen.

4. **Recommendation**  
   AdAudit selects the best plan and explains why the alternatives lose.

5. **Guardrail Review**  
   Five specialist auditors review the recommendation:

   - `TrackingAuditor`
   - `AudienceAuditor`
   - `BudgetAuditor`
   - `PolicyAuditor`
   - `CreativeLandingAuditor`

6. **Paused Execution Spec**  
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
- `POST /api/preflight/run`
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

# Optional: Gemini through Vertex AI + Application Default Credentials.
GOOGLE_GENAI_USE_VERTEXAI=false
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-2.5-flash
```

The AI client supports two provider modes:

- OpenAI-compatible chat completions for DeepSeek gateway, OpenRouter, Vultr Serverless Inference, or OpenAI.
- Gemini on Vertex AI through Application Default Credentials, matching the Google Cloud hackathon flow where API keys are disallowed.

For the verified Google Cloud path, see [GOOGLE_VERTEX_SETUP.md](GOOGLE_VERTEX_SETUP.md). It includes a `npm run smoke:vertex` test that calls Gemini through Vertex AI/ADC.

## Vultr Deployment

AdAudit is designed as one deployable web service:

```bash
npm ci
npm run build
PORT=8080 npm start
```

For the Vultr Award, deploy the Node backend and React build on a Vultr VM. See [VULTR_DEPLOYMENT.md](VULTR_DEPLOYMENT.md).

## Competition Fit

Primary target: **Vultr Award**

Strong category fit:

- **Enterprise Utility**: media buying is a measurable business workflow.
- **Agentic Workflows**: intake, evidence, simulation, recommendation, audit, execution spec.
- **Collaborative Systems**: separate planner, evidence, auditor, coordinator, and executor roles.
- **Multimodal Intelligence / Gemini**: competitor ad and landing page analysis can feed the evidence board.

## Safety Boundaries

- No real ad spend in the demo.
- All execution objects are `PAUSED`.
- No backend route creates an `ACTIVE` campaign.
- The mock executor is labeled as dry-run shaped Meta output.
- No fake ROAS winner prediction.
- No claim to be the first Meta CLI agent.
- Human approval is required before any real platform activation.

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
