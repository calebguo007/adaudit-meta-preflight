import { findRiskyClaims, hasClaimRewrite, pickOriginalRiskyClaim } from './claim-risk.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function testFindRiskyClaims() {
  assert(
    findRiskyClaims('Land a job in 7 days with our AI resume tool.').includes('time-bound or guaranteed employment outcome claim'),
    'detects time-bound employment outcome claims',
  )
  assert(
    findRiskyClaims('Your credit score is holding you back.').includes('possible personal-attribute framing'),
    'detects personal-attribute framing',
  )
  assert(findRiskyClaims('Get a resume audit with ATS score and checklist.').length === 0, 'does not flag proof-first audit copy')
}

function testHasClaimRewrite() {
  assert(hasClaimRewrite({
    items: [
      {
        field: 'Claim',
        before: 'Land a job in 7 days',
        after: 'Find hidden resume issues before applying',
      },
    ],
  }), 'accepts explicit risky-claim rewrite')

  assert(hasClaimRewrite({
    items: [
      {
        field: 'Hook copy',
        before: 'time-bound employment outcome promise',
        after: 'Show a proof-based audit score and resume checklist',
      },
    ],
  }), 'accepts evidence-derived risky-claim rewrite')

  assert(!hasClaimRewrite({
    items: [
      {
        field: 'Ad sets',
        before: '3',
        after: '2',
      },
    ],
  }), 'does not treat unrelated plan diffs as claim rewrites')
}

function testPickOriginalRiskyClaim() {
  assert(
    pickOriginalRiskyClaim({ assets: 'Land a job in 7 days or your money back.' }, {}).toLowerCase().includes('land a job in 7 days'),
    'prefers original risky claim text from intake',
  )
  assert(
    pickOriginalRiskyClaim({}, { risky_claims: ['time-bound employment outcome claim'] }) === 'time-bound employment outcome claim',
    'falls back to evidence risky claim',
  )
}

testFindRiskyClaims()
testHasClaimRewrite()
testPickOriginalRiskyClaim()

console.log('claim-risk unit tests passed')
