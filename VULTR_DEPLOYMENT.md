# Vultr Deployment

AdAudit can run as one Node web service that serves the React build and the demo API.

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
```

Set `META_EXECUTOR_MODE=real` only after the Meta Ads CLI/MCP path is fully wired and tested on a sandbox or paused account.

## Health check

```bash
curl http://localhost:8080/api/health
```

Expected response:

```json
{
  "status": "ok",
  "app": "AdAudit",
  "executor": "mock"
}
```
