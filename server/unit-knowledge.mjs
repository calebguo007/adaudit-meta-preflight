import assert from 'node:assert/strict'
import { formatKnowledgeForPrompt, retrieveKnowledgeContext } from './knowledge.mjs'

const dramaContext = await retrieveKnowledgeContext({
  product: 'Short drama streaming app',
  platform: 'TikTok, Meta, YouTube',
  budget_usd: 1200,
  claim: 'Binge the 60-second drama everyone is talking about',
  assets: 'vertical romance revenge splash ad with Watch Episode 1 CTA',
}, { limit: 5 })

assert(dramaContext.selected.length >= 3, 'should retrieve multiple knowledge packs')
assert(
  dramaContext.selected.some((pack) => pack.id === 'platform-selection-playbook'),
  'cross-platform paid media brief should retrieve platform playbook',
)
assert(
  dramaContext.selected.some((pack) => pack.id === 'creative-hypothesis-playbook' || pack.id === 'multimodal-creative-review'),
  'creative-heavy brief should retrieve creative or multimodal playbook',
)

const prompt = formatKnowledgeForPrompt(dramaContext)
assert(prompt.includes('##'), 'formatted prompt should contain titled knowledge sections')
assert(/TikTok|Meta|YouTube|creative|platform/i.test(prompt), 'formatted prompt should include paid media context')

const financeContext = await retrieveKnowledgeContext({
  product: 'AI tax optimizer',
  platform: 'Meta',
  budget_usd: 500,
  claim: 'Guaranteed refund in 7 days',
  audience: 'US finance app users',
}, { limit: 5 })

assert(
  financeContext.selected.some((pack) => pack.id === 'policy-risk-playbook'),
  'guaranteed finance claim should retrieve policy risk playbook',
)

console.log('knowledge unit tests passed')

