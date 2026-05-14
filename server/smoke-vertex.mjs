import { callAgent, aiInfo } from './ai.mjs'

const expectedProject = process.env.GOOGLE_CLOUD_PROJECT || '<missing>'

console.log('[AdAudit] Vertex smoke test')
console.log(JSON.stringify(aiInfo(), null, 2))

if (process.env.GOOGLE_GENAI_USE_VERTEXAI !== 'true') {
  throw new Error('Set GOOGLE_GENAI_USE_VERTEXAI=true before running this smoke test.')
}

if (!process.env.GOOGLE_CLOUD_PROJECT) {
  throw new Error('Set GOOGLE_CLOUD_PROJECT to the hackathon Google Cloud project id.')
}

const result = await callAgent({
  system: 'You are a concise smoke-test assistant.',
  user: `Return JSON with project="${expectedProject}", provider="vertex-ai", and ok=true.`,
  json: true,
  temperature: 0,
  maxTokens: 160,
})

console.log(JSON.stringify(result, null, 2))

if (!result?.ok) {
  throw new Error('Vertex smoke test did not return ok=true.')
}

console.log('[AdAudit] Vertex smoke test passed')
