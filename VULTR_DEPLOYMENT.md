# Vultr Deployment

AdAudit runs as one Node web service that serves the React build and the guarded media-buying API. For the Vultr Award, this VM backend is the central system of record for planning, Gemini strategy overlay, creative hypotheses, guardrail checks, repair, and paused execution.

Verified deployment:

- Public URL: http://95.179.162.188:8080
- Health URL: http://95.179.162.188:8080/api/health
- Region: Frankfurt, DE
- VM: Shared CPU `vc2-1c-1gb`, Ubuntu 24.04 LTS
- Process manager: PM2 app `adaudit`
- App path: `/opt/adaudit-meta-preflight`
- UFW ports: `22/tcp`, `8080/tcp`

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

Verified update flow:

```bash
cd /opt/adaudit-meta-preflight
git pull
npm install
npm run build
pm2 restart adaudit --update-env
```

## Environment

```bash
PORT=8080
META_EXECUTOR_MODE=mock
AI_BASE_URL=https://your-openai-compatible-provider/v1
AI_API_KEY=...
AI_MODEL=...
ADAUDIT_FAST_WORKSPACE=false

# Gemini sponsor path through Google Cloud Vertex AI + ADC.
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-2.5-flash
ADAUDIT_DISABLE_LIVE_EVIDENCE=true
```

Set `ADAUDIT_FAST_WORKSPACE=true` only for an ultra-reliable public demo fallback. Leave it `false` when you want the app to call the configured AI provider.

Set `GOOGLE_GENAI_USE_VERTEXAI=true` only in an environment with Application Default Credentials configured. The deployed Vultr VM uses:

```bash
gcloud auth application-default login --no-launch-browser
```

The ADC credential lives under `/root/.config/gcloud/application_default_credentials.json` on the VM. Do not commit or share it.

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

On the verified deployment, `ai.provider` should be `vertex-ai` and `auth` should be `application-default-credentials`.

## API smoke test

```bash
curl -X POST http://localhost:8080/api/workspace/analyze -H "content-type: application/json" -d "{\"product\":\"AI Resume Optimizer\",\"budget_usd\":500,\"demo_mode\":true}"
curl -X POST http://localhost:8080/api/campaign/execute -H "content-type: application/json" -d "{\"status\":\"PAUSED\"}"
```

The canonical hackathon flow is `/api/workspace/analyze`. The older `/api/preflight/*` endpoints are retained as legacy visualizations and should not be used as the primary demo path.

PM2 evidence for live Gemini reasoning should include:

```text
ai_overlay text_preview="Evidence: ..."
provenance source=vertex-ai-text-overlay fallback=false checks=6/6
ai_overlay success decision=READY_PAUSED
```
