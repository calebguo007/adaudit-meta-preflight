# Hackathon Submission Draft

## Project Title

AdAudit

## Short Description

AdAudit is the AI media buyer that tells teams when not to launch risky Meta campaigns.

## Long Description

Most AI ad tools help marketers launch faster. AdAudit does the opposite when the brief is unsafe: it runs a collaborative preflight audit, blocks risky launches, explains what failed, drafts safer campaign fixes, and only prepares paused campaign objects after the plan passes review.

The system is built around five specialized auditor agents:

- PixelAuditor checks tracking and conversion signal readiness.
- AudienceAuditor checks audience size, overlap, fragmentation, and learning-phase risk.
- PolicyAuditor checks sensitive claims and Meta policy risk.
- BudgetAuditor checks CPM/CPC assumptions, budget splits, and sample-size viability.
- CreativeAuditor uses Gemini-style multimodal evidence from competitor ads and Ad Library patterns.

A Coordinator agent combines those findings into a clear decision: `HOLD`, `FIX_FIRST`, or `READY_PAUSED`.

The demo shows a risky ad brief for an AI resume optimizer. AdAudit refuses to launch it, explains the failures, generates a corrected campaign plan, and creates a paused Meta-compatible campaign execution result.

## Categories And Tags

- Enterprise Utility
- Collaborative Systems
- Agentic Workflows
- Multimodal Intelligence
- Marketing Automation
- Gemini
- Vultr
- Meta Ads

## Sponsor Fit

### Vultr

AdAudit is a web-based enterprise agent with a Node backend, production-style API routes, Docker deployment, and a Vultr VM deployment guide.

### Gemini

The CreativeAuditor is designed to use Gemini for multimodal competitor ad analysis: hook pattern extraction, claim risk analysis, visual structure, and category evidence.

### Featherless

Optional extension: run one or more auditor agents on an open-source model through Featherless and keep the system MIT licensed.

## Demo Video Script

Target length: 2:45.

1. Introduce the pain: AI can launch campaigns now, but enterprises need a brake before spend happens.
2. Enter the risky brief: “Launch a $500 Meta test for my AI resume optimizer targeting US job seekers. Promise they can land a job in 7 days.”
3. Show Gemini + Ad Library evidence for proof-first competitor hooks.
4. Show the hero moment: AdAudit returns `HOLD · Not safe to launch yet`.
5. Walk through the five auditor agents and their findings.
6. Click `Auto-fix plan`.
7. Show the revised plan and `READY_PAUSED` status.
8. Click `Create paused campaign`.
9. Show Meta-compatible paused campaign IDs.
10. Close with: “AdAudit is the brake that makes autonomous ad execution safe enough for enterprise teams.”

## Architecture

- React + Vite frontend.
- Node HTTP backend.
- Multi-agent preflight contract exposed as API routes.
- Meta-compatible executor fallback.
- Dockerfile for Vultr deployment.

## Submission Checklist

- Public GitHub Repository: https://github.com/calebguo007/adaudit-meta-preflight
- Demo URL: pending Vultr deployment
- Video Presentation: pending recording
- Slide Presentation: pending
- Cover Image: pending
- License: MIT
