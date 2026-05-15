import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const SKILL_DIR = join(process.cwd(), 'server', 'knowledge', 'skills')
let cachedSkills = null

const DOMAIN_KEYWORDS = {
  'platform-selection-playbook': ['meta', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'search', 'linkedin', 'platform', 'channel'],
  'creative-hypothesis-playbook': ['creative', 'hook', 'hypothesis', 'asset', 'ad', 'ugc', 'cta', 'copy', 'video', 'image'],
  'policy-risk-playbook': ['guarantee', 'guaranteed', '7 days', 'lose', 'weight', 'job', 'employment', 'finance', 'health', 'claim', 'policy', 'risk'],
  'budget-signal-and-economics': ['budget', 'cpa', 'cpc', 'cpm', 'roas', 'ltv', 'aov', 'margin', 'learning', 'signal', 'scale', 'kill'],
  'multimodal-creative-review': ['image', 'screenshot', 'vision', 'visual', 'creative', 'headline', 'cta', 'thumbnail'],
  'vertical-patterns-general': ['short drama', 'drama', 'ecommerce', 'e-commerce', 'saas', 'b2b', 'consumer', 'app', 'lead generation', 'finance', 'health'],
  'paid-media-operating-model': ['agent', 'workflow', 'plan', 'audit', 'paused', 'execution', 'compare', 'repair'],
}

export async function retrieveKnowledgeContext(input = {}, options = {}) {
  const skills = await loadKnowledgeSkills()
  const query = buildKnowledgeQuery(input)
  const queryTokens = tokenize(query)
  const requestedLimit = Number(options.limit || 5)
  const scored = skills
    .map((skill) => ({
      ...skill,
      score: scoreSkill(skill, query, queryTokens),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  const selected = scored
    .filter((skill, index) => skill.score > 0 || index < 3)
    .slice(0, Math.max(1, requestedLimit))
    .map((skill) => ({
      id: skill.id,
      title: skill.title,
      score: skill.score,
      snippets: extractSnippets(skill.content, queryTokens, options.snippetsPerSkill || 3),
    }))

  return {
    mode: 'local_knowledge_pack',
    query,
    selected,
    summary: selected.map((skill) => `${skill.title}: ${skill.snippets[0] || 'available'}`).join(' | '),
  }
}

export function formatKnowledgeForPrompt(knowledgeContext) {
  if (!knowledgeContext?.selected?.length) return 'No paid media knowledge snippets retrieved.'
  return knowledgeContext.selected
    .map((skill) => [
      `## ${skill.title} (${skill.id})`,
      ...skill.snippets.map((snippet) => `- ${snippet}`),
    ].join('\n'))
    .join('\n\n')
}

async function loadKnowledgeSkills() {
  if (cachedSkills) return cachedSkills
  const files = (await readdir(SKILL_DIR)).filter((file) => file.endsWith('.md')).sort()
  cachedSkills = await Promise.all(files.map(async (file) => {
    const content = await readFile(join(SKILL_DIR, file), 'utf8')
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(file, '.md')
    return {
      id: basename(file, '.md'),
      title,
      content,
    }
  }))
  return cachedSkills
}

function buildKnowledgeQuery(input = {}) {
  const values = [
    input.product,
    input.platform,
    input.objective,
    input.audience,
    input.claim,
    input.assets,
    input.competitors,
    input.constraints,
    input.landing_page,
    input.landing_page_notes,
    input.budget_usd || input.budget,
    input.target_cpa || input.target_cpa_usd,
    input.aov,
    input.margin || input.gross_margin,
  ]
  return values.filter(Boolean).join('\n')
}

function scoreSkill(skill, query, queryTokens) {
  const idKeywords = DOMAIN_KEYWORDS[skill.id] || []
  const lowerQuery = query.toLowerCase()
  const lowerContent = skill.content.toLowerCase()
  let score = 0

  for (const keyword of idKeywords) {
    if (lowerQuery.includes(keyword)) score += 8
  }

  for (const token of queryTokens) {
    if (token.length < 3) continue
    if (lowerContent.includes(token)) score += 1
  }

  if (skill.id === 'paid-media-operating-model') score += 3
  if (skill.id === 'budget-signal-and-economics') score += 2
  if (skill.id === 'creative-hypothesis-playbook') score += 2
  return score
}

function extractSnippets(content, queryTokens, limit) {
  const bullets = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^-\s+/, '').trim())

  if (!bullets.length) return []
  const scored = bullets
    .map((line, index) => ({
      line,
      index,
      score: snippetScore(line, queryTokens),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  return scored.slice(0, Math.max(1, limit)).map((item) => item.line)
}

function snippetScore(line, queryTokens) {
  const lower = line.toLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (token.length >= 3 && lower.includes(token)) score += 1
  }
  if (/must|should|avoid|only|kill|scale|paused|proof|budget|platform|policy/i.test(line)) score += 1
  return score
}

function tokenize(value) {
  return [...new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean))]
}

