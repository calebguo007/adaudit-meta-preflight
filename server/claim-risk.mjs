const RISK_PATTERNS = [
  {
    id: 'employment_outcome_guarantee',
    label: 'time-bound or guaranteed employment outcome claim',
    pattern: /land a job|get hired|guarantee|guaranteed|7 days|seven days|money back|employment outcome|time-bound/i,
    extractPattern: /land a job in 7 days|land a job|get hired|guaranteed?[^,.!。！？]{0,80}|[^,.!。！？]{0,40}(?:7 days|seven days|money back|employment outcome|time-bound)[^,.!。！？]{0,40}/i,
  },
  {
    id: 'personal_attribute_framing',
    label: 'possible personal-attribute framing',
    pattern: /you are|your (?:body|health|credit|debt|income|job)/i,
    extractPattern: /(?:you are|your (?:body|health|credit|debt|income|job))[^,.!。！？]{0,80}/i,
  },
]

const SAFE_REWRITE_PATTERN = /proof|diagnosis|diagnostic|audit|score|hidden|resume issue|resume issues|readiness|checklist|before applying|quality/i

export function findRiskyClaims(text = '') {
  const source = String(text || '')
  return RISK_PATTERNS
    .filter((item) => item.pattern.test(source))
    .map((item) => item.label)
}

export function hasClaimRewrite(planDiff) {
  const items = Array.isArray(planDiff?.items) ? planDiff.items : []
  return items.some((item) => {
    const field = String(item?.field || '')
    const before = String(item?.before || '')
    const after = String(item?.after || '')
    const fieldIsClaim = /claim|hook|copy|message/i.test(field)
    const beforeLooksRisky = RISK_PATTERNS.some((risk) => risk.pattern.test(before))
    const afterLooksSafe = SAFE_REWRITE_PATTERN.test(after)
    return fieldIsClaim && beforeLooksRisky && afterLooksSafe
  })
}

export function pickOriginalRiskyClaim(intake = {}, evidence = {}) {
  const text = `${intake.assets || ''}\n${intake.landing_page || ''}`
  for (const risk of RISK_PATTERNS) {
    const match = text.match(risk.extractPattern || risk.pattern)
    if (match) return match[0].trim()
  }
  if (Array.isArray(evidence.risky_claims) && evidence.risky_claims[0]) return evidence.risky_claims[0]
  return 'Risky outcome promise'
}
