# Vultr Deployment

AdAudit runs as one Node web service that serves the React build and the guarded media-buying API. For the Vultr Award, this VM backend is the central system of record for planning, Gemini-style evidence, creative hypotheses, multi-agent audit, repair, and paused execution.

## Option A: Docker

```bash
docker build -t adaudit-meta-preflight .
docker run -p 8080:8080 -e PORT=8080 adaudit-meta-preflight
```

Deploy the image on a Vultr VM or Vultr Kubernetes, expose port `8080`, and put a TLS reverse proxy in front of it for the public demo URL.

## Option B: Node on a Vultr VM

```bash
sudo apt update
sudo apt install -y nodejs npm
git clone <your-public-repo-url>
cd adaudit-meta-preflight
npm ci
npm run build
PORT=8080 npm start
```

Recommended production process:

```bash
sudo npm install -g pm2
PORT=8080 pm2 start server/index.mjs --name adaudit
pm2 save
```

## Environment

```bash
PORT=8080
META_EXECUTOR_MODE=mock
AI_BASE_URL=https://your-openai-compatible-provider/v1
AI_API_KEY=...
AI_MODEL=...
ADAUDIT_FAST_WORKSPACE=false

# Optional Gemini sponsor path through Google Cloud Vertex AI + ADC.
GOOGLE_GENAI_USE_VERTEXAI=false
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-2.5-flash
```

Set `ADAUDIT_FAST_WORKSPACE=true` only for an ultra-reliable public demo fallback. Leave it `false` when you want the app to call the configured AI provider.

Set `GOOGLE_GENAI_USE_VERTEXAI=true` only in an environment with Application Default Credentials configured. In Google Cloud Shell, the hackathon project can authenticate this way after enabling `aiplatform.googleapis.com`.

Set `META_EXECUTOR_MODE=real` only after the Meta Ads CLI path is fully wired and tested on a sandbox or paused account. Active campaign creation is intentionally unsupported; the executor must keep `status=PAUSED`.

## Health check

```bash
curl http://localhost:8080/api/health
```

Expected response:

```json
{
  "status": "ok",
  "app": "AdAudit",
  "mode": "guarded-media-buyer",
  "executor": "mock",
  "active_execution_supported": false
}
```

## API smoke test

```bash
curl -X POST http://localhost:8080/api/workspace/analyze -H "content-type: application/json" -d "{\"product\":\"AI Resume Optimizer\",\"budget_usd\":500,\"demo_mode\":true}"
curl -X POST http://localhost:8080/api/preflight/run -H "content-type: application/json" -d "{\"brief\":\"Launch a $500 Meta test\"}"
curl -X POST http://localhost:8080/api/campaign/execute -H "content-type: application/json" -d "{\"status\":\"PAUSED\"}"
```
