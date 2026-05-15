# AdAudit Demo Video — Recording Script

**Total length target**: 2:00 (hard cap 2:15)
**Format**: Screen capture (1920×1080 or 2880×1800) + voiceover.
**Recording mode**: Live agent run only. **No demo / fixture path exists in the product.**
**Prep**: open `http://95.179.162.188:8080`, page already loaded to Intake. Have a real Meta-style ad mockup PNG ready to drag in (resume optimizer creative recommended).

---

## Scene 1 — Hook (0:00 – 0:10)

**Screen**: black frame fade to AdAudit Intake page top section, masthead visible. Cursor parked.

**Voiceover**:
> AI agents can now spend ad budgets. The enterprise problem is knowing when **not** to let them. This is AdAudit — a guarded AI media buyer that audits before it spends.

**Cut to**: focus on the hero copy "The media buyer that audits before it spends."

---

## Scene 2 — Intake (0:10 – 0:28)

**Screen action**:
1. Click "Load risky sample brief" — fields auto-fill (Product, Budget $500, Audience, Risky claim "Land a job in 7 days").
2. Drag a real ad mockup into the creative upload zone. Preview appears.
3. Camera lingers 1s on the pulsing "Live agent run" note.
4. Click **Run guarded media plan**.

**Voiceover**:
> One brief, real economics. Product. Budget. Target CPA. The risky claim — "land a job in seven days." Drop in the creative.
> Every brief here triggers real Vertex AI reasoning, knowledge retrieval, Gemini Vision on the creative, and program guardrails. There is no fixture mode.

---

## Scene 3 — Live Tool Trace (0:28 – 0:55)

**Screen action**:
1. Page transitions to Review.
2. Top mode pill reads "LIVE AGENT RUN · real evidence · Vertex AI · Gemini Vision · program guardrails".
3. PixelOpsWorld stations light up one by one.
4. Tool calls stream into the list: `browser.fetch` → `competitor.search` → `vision.analyze` → `nano-banana.annotate` → `knowledge.search` → `math.compute` → `policy.lookup` → `audit.score`.
5. Browser Cameo overlay materializes top-right when `browser_open` fires.
6. Evidence cards arrive on the right.

**Voiceover** (matched to events):
> The agent fetches the landing page. Reads category patterns from competitor ads. Sends the creative to Gemini Vision and asks Nano Banana to mark the risky areas. Pulls knowledge packs — budget signal, policy, creative playbook. Computes the math on five hundred dollars across two ad sets. Checks Meta employment policy. Runs six program-level guardrails.

---

## Scene 4 — Verdict First Viewport (0:55 – 1:15)

**Screen action**:
1. Page transitions to Verdict. First viewport: huge italic "Ready, but paused."
2. Right column: compact **GEMINI VISION** card with the annotated creative (numbered red circles drawn by Nano Banana) and **LIVE** pulse pill.
3. Below the title: 3 meta dots — `6 of 6 guardrails passed`, `Active spend disabled`, `Human approval required`.
4. Two buttons visible: **Prepare paused campaign** (primary) + **View full audit ↓**.

**Voiceover**:
> The verdict. "Ready, but paused." Six of six guardrails passed. Active spend is structurally disabled — human approval is the only path forward. On the right, Gemini Vision has annotated the creative directly with Nano Banana. This is not a heuristic overlay. The image you uploaded was actually inspected by Gemini.

**Visual emphasis**: zoom slightly on the GEMINI VISION badge for half a second. This is the cover image candidate frame.

---

## Scene 5 — Why It's Reliable + Scenarios + Diff (1:15 – 1:40)

**Screen action**: scroll down.
1. Reliability Panel — "Five sources of evidence behind the decision." Reveal the 5 numbered rows: Evidence, Knowledge, Budget math, Causal guardrails, Paused executor.
2. Continue scrolling. Scenario Selection — three plans side by side. Aggressive is NOT selected; Balanced is. Hover Aggressive once to show why it lost.
3. Before / After Repair grid. Highlight CLAIM row: "Land a job in 7 days" → "Find hidden resume issues before applying."
4. OBJECTIVE: CONVERSIONS → LEADS. AD SETS: 3 → 2.

**Voiceover**:
> Five sources of evidence behind the decision. Knowledge packs, real budget math, six program assertions, paused executor — not an LLM with confidence, a reviewed system with checks.
> Three plans were compared. Aggressive was rejected because the pixel is not warm and the budget can't sustain a conversions objective. Balanced won. The risky claim was rewritten. Objective dropped from conversions to leads. Three ad sets collapsed to two.

---

## Scene 6 — Agent Handoff + Launch (1:40 – 2:00)

**Screen action**: continue scrolling.
1. Agent timeline — 6 named agents in order: Evidence Agent, Media Planner Agent, Budget Economics Agent, Delivery Readiness Agent, Coordinator Agent, Paused Executor.
2. Causal guardrails sidebar — 6 / 6 PASS visible.
3. Click **Create paused campaign**.
4. Modal / inline reveal: `campaign_id=23868140xxx · status=PAUSED · executor=mock`.

**Voiceover**:
> Six named agents. Coordinator picks one plan and records why alternatives lose. Six program assertions verify it. The executor is constrained — it produces only paused Meta-compatible campaign objects. A human still has to flip the switch.

**Closing line, 5s on the final frame** (paused campaign IDs visible):

> AdAudit is the AI media buyer that can plan — but also knows when to stop.

---

## Recording Notes

**Pacing**:
- Total tool-call stream takes ~15-25s in live mode. Don't speed it up; the rhythm IS the agent feel.
- Pause 0.4s on each transition (Intake→Review, Review→Verdict). The decision moment needs room to breathe.

**Audio**:
- Voiceover should be ~155 words/min. The script above is ~245 words → 1:35 of speech. Leaves ~25s for ambient (clicks, transitions, paused readings).
- No music in v1. If you must add, use ambient piano under -28dB.

**Common failure modes during recording**:
- **Nano Banana takes 8-15s.** Don't cut early. If it fails, the markers fall back to vertex Vision coords (`vision_result_arrived`). Both look good.
- **Vision fails entirely?** The coord-based markers from claim risk show with NO `LIVE` pill. Rerecord; or just re-run.
- **Vertex timeout?** Rerun. The trace will complete with `tool_call_error` events but verdict still arrives.

**Cover image frame**: 0:58 (Verdict first viewport with GEMINI VISION LIVE pulse). Export as PNG at 1920×1080.

---

## On-Screen Tagline Reminders

- Opening: `AI agents can now spend ad budgets. The enterprise problem is knowing when not to.`
- Mid-point: `LIVE AGENT RUN · real evidence · Vertex AI · Gemini Vision · program guardrails`
- Closing: `The AI media buyer that can plan — but knows when to stop.`
