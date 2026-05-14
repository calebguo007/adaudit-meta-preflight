# Google Vertex AI Setup

AdAudit supports Gemini through Google Cloud Vertex AI with Application Default Credentials (ADC). This matches the hackathon Google flow where API keys may be disallowed.

## Confirm Google Cloud Is Ready

In Google Cloud Shell:

```bash
gcloud config set project project-258a4684-a97c-421d-bac
gcloud services enable aiplatform.googleapis.com
gemini "Say hello in one sentence"
```

If the Gemini CLI returns text, the account and project can use Gemini from Cloud Shell.

## Smoke Test AdAudit With Vertex

Clone the repo in Cloud Shell, then run:

```bash
npm ci
GOOGLE_GENAI_USE_VERTEXAI=true \
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac \
GOOGLE_CLOUD_LOCATION=global \
GEMINI_MODEL=gemini-2.5-flash \
npm run smoke:vertex
```

Expected output includes:

```json
{
  "provider": "vertex-ai",
  "auth": "application-default-credentials"
}
```

and:

```text
[AdAudit] Vertex smoke test passed
```

If this command is run on a local machine without ADC, it will fail with:

```text
Could not load the default credentials
```

That is expected. The hackathon Google account has ADC available in Cloud Shell, as shown by the Gemini CLI authentication banner.

## Run The Web App With Vertex

```bash
npm run build
GOOGLE_GENAI_USE_VERTEXAI=true \
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac \
GOOGLE_CLOUD_LOCATION=global \
GEMINI_MODEL=gemini-2.5-flash \
PORT=8080 \
npm start
```

Then open the app and check `/api/health`. It should show:

```json
{
  "ai": {
    "provider": "vertex-ai",
    "model": "gemini-2.5-flash",
    "auth": "application-default-credentials"
  }
}
```

## Optional: Google VM Route

If you want a Google-hosted sandbox VM for the demo:

1. Create a small Compute Engine VM.
2. Attach the default service account or a service account with Vertex AI permissions.
3. SSH into the VM and run:

```bash
sudo apt update
sudo apt install -y git nodejs npm
git clone <your-public-repo-url>
cd adaudit-meta-preflight
npm ci
npm run build
GOOGLE_GENAI_USE_VERTEXAI=true \
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac \
GOOGLE_CLOUD_LOCATION=global \
GEMINI_MODEL=gemini-2.5-flash \
PORT=8080 \
npm start
```

For a stable process:

```bash
sudo npm install -g pm2
GOOGLE_GENAI_USE_VERTEXAI=true \
GOOGLE_CLOUD_PROJECT=project-258a4684-a97c-421d-bac \
GOOGLE_CLOUD_LOCATION=global \
GEMINI_MODEL=gemini-2.5-flash \
PORT=8080 \
pm2 start server/index.mjs --name adaudit
pm2 save
```

## Deployment Note

Cloud Shell ADC is convenient for validation. For a long-running VM, use a Google Cloud VM service account with Vertex AI permissions, or keep the production demo on the OpenAI-compatible provider and use this Vertex smoke test as the verified Gemini integration path.
