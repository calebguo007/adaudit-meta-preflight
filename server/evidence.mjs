import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { findRiskyClaims } from './claim-risk.mjs'

const ARTIFACT_ROOT = resolve(process.cwd(), 'artifacts', 'evidence')

export async function collectEvidence(input = {}) {
  const normalized = normalizeEvidenceInput(input)
  const jobId = `ev_${Date.now().toString(36)}`
  const artifactDir = join(ARTIFACT_ROOT, jobId)

  const fixture = buildEvidenceFixture(normalized, jobId)
  const liveDisabled = process.env.ADAUDIT_DISABLE_LIVE_EVIDENCE === 'true' && !normalized.force_live_evidence
  if (normalized.demo_mode || liveDisabled) {
    return fixture
  }

  try {
    const live = await collectLivePageEvidence(normalized, jobId, artifactDir)
    return {
      ...fixture,
      mode: live.mode,
      artifacts: live.artifacts.length ? live.artifacts : fixture.artifacts,
      structured_evidence: {
        ...fixture.structured_evidence,
        page_claims: live.claims.length ? live.claims : fixture.structured_evidence.page_claims,
        landing_page_gaps: live.landingPageGaps.length ? live.landingPageGaps : fixture.structured_evidence.landing_page_gaps,
      },
      notes: live.notes,
    }
  } catch (error) {
    return {
      ...fixture,
      mode: 'fixture_fallback',
      notes: [`Live evidence collection failed: ${error.message}. Fixture evidence used for demo stability.`],
    }
  }
}

function normalizeEvidenceInput(input) {
  const landingPage = String(input.landing_page || input.landing_page_notes || '')
  const productUrl = String(input.product_url || (/^https?:\/\//i.test(landingPage.trim()) ? landingPage.trim() : ''))
  const competitorUrls = Array.isArray(input.competitor_urls)
    ? input.competitor_urls
    : String(input.competitor_urls || input.competitors || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.startsWith('http'))

  return {
    demo_mode: Boolean(input.demo_mode),
    force_live_evidence: Boolean(input.force_live_evidence),
    product: String(input.product || 'AI Resume Optimizer'),
    product_url: productUrl,
    landing_page: landingPage,
    assets: String(input.assets || ''),
    competitors: String(input.competitors || ''),
    competitor_urls: competitorUrls,
  }
}

function buildEvidenceFixture(input, jobId) {
  const riskyClaims = findRiskyClaims(`${input.assets}\n${input.landing_page}`)
  const hasRiskyClaim = riskyClaims.length > 0

  return {
    job_id: jobId,
    mode: 'fixture',
    artifacts: [
      {
        type: 'landing_page_notes',
        label: `${input.product} landing page`,
        uri: input.product_url || 'fixture://product-page',
        summary: input.landing_page || 'Landing page notes were not supplied; fixture uses default resume-tool evidence.',
      },
      {
        type: 'competitor_pattern',
        label: 'Resume tool category pattern',
        uri: 'fixture://resume-tool-category-patterns',
        summary: 'Competitors tend to use ATS visibility, before/after resume clarity, recruiter credibility, and fast audit hooks.',
      },
    ],
    structured_evidence: {
      hook_patterns: ['ATS visibility', 'before/after clarity', 'hidden rejection mechanism', 'recruiter proof'],
      risky_claims: hasRiskyClaim ? riskyClaims : ['time-bound employment outcomes are category-sensitive even when not on the landing page'],
      cta: input.landing_page.includes('Get my resume audit') ? 'Get my resume audit' : 'unknown CTA',
      proof_mechanisms: ['ATS score delta', 'side-by-side resume rewrite', 'checklist of keyword and formatting issues'],
      landing_page_gaps: [
        input.landing_page ? 'Verify that the first screen repeats the same proof mechanism as the ad.' : 'Landing page evidence is missing.',
        'Add a concrete proof artifact before scaling, such as an ATS checklist or sample score.',
      ],
      page_claims: [input.landing_page, input.assets].filter(Boolean).slice(0, 3),
      implications: [
        'Use proof-first creative hypotheses instead of guaranteed job outcomes.',
        'Treat aggressive conversion testing as unsafe until tracking and economics are verified.',
      ],
    },
    notes: ['Fixture evidence keeps demo timing stable; live collection can replace artifacts when URLs are reachable.'],
  }
}

async function collectLivePageEvidence(input, jobId, artifactDir) {
  const pages = [
    { role: 'product', url: input.product_url },
    ...input.competitor_urls.slice(0, 2).map((url, index) => ({ role: `competitor_${index + 1}`, url })),
  ].filter((page) => page.url)

  if (!pages.length) {
    throw new Error('No product_url or competitor_urls supplied')
  }

  let playwright
  try {
    playwright = await import('playwright')
  } catch (error) {
    return collectLiveFetchEvidence(input, jobId, error)
  }
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  await mkdir(artifactDir, { recursive: true })
  const artifacts = []
  const claims = []
  const landingPageGaps = []

  try {
    for (const pageTarget of pages) {
      const page = await browser.newPage({ viewport: { width: 1365, height: 900 } })
      await page.goto(pageTarget.url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const title = await page.title()
      const bodyText = (await page.locator('body').innerText({ timeout: 5000 })).replace(/\s+/g, ' ').slice(0, 2200)
      const screenshotPath = join(artifactDir, `${pageTarget.role}.png`)
      const textPath = join(artifactDir, `${pageTarget.role}.txt`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      await writeFile(textPath, bodyText, 'utf8')
      artifacts.push({
        type: 'browser_capture',
        label: `${pageTarget.role}: ${title || pageTarget.url}`,
        uri: screenshotPath,
        text_uri: textPath,
        source_url: pageTarget.url,
        summary: bodyText.slice(0, 240),
      })
      claims.push(...extractClaims(bodyText))
      if (pageTarget.role === 'product' && !/proof|score|audit|case|testimonial|review/i.test(bodyText)) {
        landingPageGaps.push('The captured product page does not expose an obvious proof artifact above the fold.')
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }

  return {
    job_id: jobId,
    mode: 'live_playwright',
    artifacts,
    claims: [...new Set(claims)].slice(0, 5),
    landingPageGaps,
    notes: ['Live Playwright collection completed in the backend orchestration path.'],
  }
}

async function collectLiveFetchEvidence(input, jobId, importError) {
  const pages = [
    { role: 'product', url: input.product_url },
    ...input.competitor_urls.slice(0, 2).map((url, index) => ({ role: `competitor_${index + 1}`, url })),
  ].filter((page) => page.url)

  if (!pages.length) {
    throw new Error('No product_url or competitor_urls supplied')
  }

  const artifacts = []
  const claims = []
  const landingPageGaps = []

  for (const pageTarget of pages) {
    const response = await fetch(pageTarget.url, {
      headers: {
        'user-agent': 'AdAudit evidence collector (+https://github.com/calebguo007/adaudit-meta-preflight)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) throw new Error(`Fetch failed for ${pageTarget.url}: ${response.status}`)
    const html = await response.text()
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2200)

    artifacts.push({
      type: 'browser_fetch',
      label: `${pageTarget.role}: ${pageTarget.url}`,
      uri: pageTarget.url,
      source_url: pageTarget.url,
      summary: bodyText.slice(0, 240),
    })
    claims.push(...extractClaims(bodyText))
    if (pageTarget.role === 'product' && !/proof|score|audit|case|testimonial|review/i.test(bodyText)) {
      landingPageGaps.push('The fetched product page does not expose an obvious proof artifact in the extracted text.')
    }
  }

  return {
    job_id: jobId,
    mode: 'live_fetch',
    artifacts,
    claims: [...new Set(claims)].slice(0, 5),
    landingPageGaps,
    notes: [
      'Live HTTP evidence collection completed.',
      `Playwright browser capture was unavailable: ${importError.message}.`,
    ],
  }
}

function extractClaims(text) {
  const sentences = text
    .split(/[.!?。！？]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 28 && line.length < 180)
  return sentences
    .filter((line) => /guarantee|days|score|audit|proof|result|job|resume|hire|conversion|revenue/i.test(line))
    .slice(0, 5)
}
