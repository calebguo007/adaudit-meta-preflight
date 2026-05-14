# Hackathon Submission Draft

## Project Title

AdAudit

## Short Description

AdAudit is a guarded AI media buyer that simulates Meta campaign options, recommends the cheapest viable test, audits the plan, and prepares only paused execution.

## Long Description

AdAudit turns an advertising brief into a media-buying decision workspace running on a Vultr VM.

The user enters product context, landing page notes, budget, objective, KPI priorities, audience, available creative assets, competitor references, constraints, and tracking status. AdAudit then compares three campaign strategies: a cheap validation test, a balanced learning test, and an aggressive conversion test. Each strategy includes objective, budget, structure, expected signal, KPI ranges, and risk.

The system recommends the best plan and explains why the alternatives lose. Gemini on Vertex AI adds a live strategy overlay over the evidence, creative direction, risk, and paused-launch decision. The backend then applies deterministic causal checks across tracking readiness, audience structure, budget viability, policy risk, and creative-to-landing-page match. The final output is a Meta-compatible paused execution spec. The demo never creates active campaigns and never spends money automatically.

The default demo brief is an AI resume optimizer with a $500 Meta budget, unknown pixel status, job-seeker audience, and one risky employment-outcome claim. AdAudit shows that an aggressive conversion campaign is likely to waste spend or fail policy review, recommends a leaner validation or lead-generation test, removes risky claims, and prepares only `PAUSED` campaign objects for human approval.

## What Makes It Different

Most hackathon ad tools generate copy or images. AdAudit performs the media-buying judgment layer:

- It compares multiple campaign strategies instead of producing one plan.
- It explains tradeoffs using budget, tracking, signal volume, policy, and creative evidence.
- It separates recommendation from execution.
- It uses a workspace timeline plus code-level causal checks before preparing the launch spec.
- It uses Gemini as a live strategy overlay while keeping execution safety deterministic.
- It has no active-spend path.

## Categories And Tags

- Enterprise Utility
- Agentic Workflows
- Collaborative Systems
- Multimodal Intelligence
- Marketing Automation
- Media Buying
- Gemini
- Vultr
- Meta Ads

## Sponsor Fit

### Vultr

AdAudit is a web-based enterprise agent deployed as a Node backend plus React frontend. The backend is the central system of record for intake, research evidence, simulation, recommendation, audit, and paused execution.

Verified Vultr demo URL: http://95.179.162.188:8080

### Gemini

Gemini is used through Google Cloud Vertex AI with Application Default Credentials. In the verified deployment, Gemini 2.5 Flash provides a live plain-text strategy overlay over stable evidence artifacts. This avoids brittle giant JSON generation while still showing live Gemini reasoning in the product flow.

### Featherless

Optional extension: run one background auditor or scheduled review loop through an open-source model. This is not required for the main demo.

## Demo Video Script

Target length: 2:45.

1. **0:00-0:15**  
   "AI can generate ads and call ad platforms. The hard enterprise problem is deciding what should be tested before money is spent."

2. **0:15-0:35**  
   Fill the campaign intake: AI resume optimizer, $500 Meta budget, lead goal, US job seekers, unknown pixel, one risky "land a job in 7 days" draft.

3. **0:35-1:05**  
   Click the live AI workspace path. Show three strategies side by side: validation, balanced, aggressive.

4. **1:05-1:35**  
   Show the recommendation: why the cheapest viable test wins, why conversion-first loses, and which KPI ranges matter.

5. **1:35-2:05**  
   Show evidence and creative hypotheses, including the Gemini strategy overlay: proof-first resume score, hidden rejection mechanism, outcome-promise risk.

6. **2:05-2:25**  
   Show the workspace timeline and `Guardrails 6/6 PASS`: evidence, planner, budget economics, delivery readiness, coordinator, and paused executor.

7. **2:25-2:40**  
   Click `Create paused campaign objects`. Show Meta-compatible paused IDs.

8. **2:40-2:45**  
   Close: "AdAudit simulates the media buy before the agent spends."

## Architecture

- React + Vite frontend.
- Node HTTP backend serving the app and API.
- Google Vertex AI / Gemini 2.5 Flash via ADC for live strategy overlay.
- Deterministic backend workspace for reliable campaign planning and execution safety.
- Built-in playbook fallback for reliable demo mode.
- Workspace roles for evidence, creative hypotheses, recommendation, guardrails, and execution spec.
- Meta-compatible executor fallback that only returns `PAUSED` responses.
- Dockerfile and direct Node instructions for Vultr deployment.

## Submission Checklist

- Public GitHub Repository: https://github.com/calebguo007/adaudit-meta-preflight
- Demo URL: http://95.179.162.188:8080
- Video Presentation: pending recording
- Slide Presentation: pending
- Cover Image: pending
- License: MIT
