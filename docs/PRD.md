# Clauseguard — Product + Team Brief

The single source of truth for **what to build** and **who owns what.**
You and your teammate figure out the building process.

---

## The Product in One Sentence

**Clauseguard is the only AI contract tool that tells freelancers what they're missing** — on both sides of the freelancer-client relationship.

## Differentiation Principle (load-bearing)

Every feature decision gets evaluated against this bar: **is this original, or is it copycat?**

The 2026 AI contract tool landscape is mature and crowded (Simular.ai, Kuse.ai, Bookipi, Lumin, Bind Legal, HoneyBook AI — all do "30-second contract generation from plain language"). Speed-of-generation is table stakes. Clauseguard swims against the current:

- Every competitor optimizes for **SPEED**. Clauseguard optimizes for **COVERAGE** (what are you missing?).
- Every competitor **generates**. Almost none **audit** (redline client contracts). The audit is the most differentiated angle in the landscape.

If a feature makes Clauseguard a worse version of an existing tool, cut it. If it makes Clauseguard the only version of itself, keep it.

---

## Two Demo Flows (committed)

### Flow 1 — The Interrogator

A freelancer describes their gig. Clauseguard asks sharp follow-up questions a lawyer would ask. Each answer visibly closes a real legal gap. A contract materializes live. By the end, the freelancer has a contract AND a one-page exposure report.

**Storyboard:**
```
[empty gig input] → [typing "logo design for local coffee shop, $800"]
   → [first sharp question: "You didn't mention a kill fee. What happens if they cancel at round 2?"]
   → [exposure dial: red 30%]
   → [answer → dial: orange 50%]
   → [next question: "Who owns the final files after payment?"]
   → [answer → dial: yellow 70%]
   → [more Q&A → dial climbs to green 95%]
   → [contract materializes, scrolling in token-by-token]
   → [exposure report: covered clauses, gap clauses, plain-English per clause]
```

**The "whoa" moment:** the exposure dial moving red → green IS the demo. Universally legible in 5 seconds.

### Flow 2 — The Audit Preview

A freelancer pastes a client's contract. After ~8 seconds of scanning, red flags fire: "work-for-hire trap detected," "unlimited revisions = unpaid scope creep," "missing kill fee = zero pay if client ghosts." Each flag has a severity badge, the specific clause quoted, and a plain-English explanation.

**Storyboard:**
```
[empty paste area] → [pasting client contract]
   → ["scanning for traps..." pulse animation, ~8s]
   → [TRAPS FOUND counter ticks up: 0 → 1 → 2 → 3 → 5]
   → [click counter → card stack expands below]
   → [each card: severity badge (red/yellow/green), clause quote, plain-English explanation]
   → ["5 traps found" summary badge]
```

**The "whoa" moment:** the trap counter ticking up as the scan runs. Then the click-to-expand cards make abstract clauses concrete with real stakes.

---

## Locked Feature Scope

### In scope (committed for the hackathon)

- **Interrogator spine:** gig description input → branching Q&A → contract output + exposure report
- **Exposure dial:** animated SVG circle, red → green, driven by real clause-coverage math (not theatrical)
- **Clause library:** 2 gig types (logo/design + software development), 6–8 clause nodes per gig type
- **Live contract reshape animation:** contract materializes token-by-token as answers stream in
- **Exposure report one-pager:** covered clauses, gap clauses, plain-English explanations; print-to-PDF friendly
- **Audit-preview flow:** paste client contract → 8s scan → trap counter → click-to-expand card stack
- **10 audit red-flag categories** (specific list below)
- **Demo preset buttons:** "try: logo design," "try: software gig," "try: bad client contract" — one click loads scripted inputs
- **Demo cache fallback:** both flows have a pre-generated cached output if the live Claude API fails or returns garbage mid-demo
- **Deployed Vercel URL:** judges can poke it on their phones after the pitch

### The 10 audit red-flag categories (the audit must detect these)

1. **Work-for-hire trap** — IP assignment overly broad or defaulting to client
2. **Unlimited revisions** — no revision cap (scope creep vector)
3. **Missing kill fee** — zero pay if client ghosts mid-project
4. **Vague scope-of-work** — no deliverables list, no acceptance criteria
5. **IP transfer timing gap** — IP transfers before final payment
6. **Asymmetric indemnification** — freelancer indemnifies client but not vice versa
7. **No late-payment penalty** — no interest accrued on overdue invoices
8. **Overbroad NDA** — no time limit, no carve-outs for public info
9. **Auto-renewal / evergreen clause** — hidden in termination section
10. **Jurisdiction mismatch** — disputes resolved in client's home court, not freelancer's

### Deferred to TODOS.md (post-hackathon polish)

- "Show me the disaster" annotations (real freelancer horror stories per clause)
- Voice input for gig description (Web Speech API)
- React Flow graph visualization (clause dependency graph)
- Negotiation simulator (AI role-plays as client's lawyer — this is the v2 product angle)
- Multi-jurisdiction support
- Streaming progressive trap counter (let counter tick live during LLM call, not just post-response)
- Layer 5 LLM-based injection classifier (second-model detection; too expensive for hackathon)
- Live-edit (judge types unscripted gig description; wizard adapts)

---

## How the Team Will Work Together

### Person A — Clause Architect + Audit Logic

**Owns:**
- Clause library (2 gig types, 6–8 nodes each, authored from Stanford CodeX / Common Form DB source material)
- Clause dependency graph schema (clause nodes with `dependsOn`, `triggersWhen`, authored `questions[]`)
- The `getNextQuestions(answeredState, gigType)` graph-walking function
- Audit prompt engineering (system prompt with the 10 red-flag categories, response schema)
- Audit cache fallback (pre-generate scripted bad-contract response, switch on failure)
- Exposure-weight assignments per clause (0–10 integer scale based on consequence severity)

**Does NOT own:**
- Any UI work (Person B)
- The contract-assembly LLM prompt (Person B)
- Vercel deploy setup (Person B)

### Person B — App Skeleton + UI + Contract Assembly

**Owns:**
- Git repo init + Next.js scaffolding + Vercel project setup + first deploy
- Wizard UI (one question per screen, transitions)
- Exposure dial component (animated SVG, red → green)
- Live contract preview (token-streaming render)
- Audit UI (paste textarea, animated trap counter, click-to-expand card stack, severity badges)
- Contract-assembly LLM prompt (input: gig description + answered state + clause nodes → output: flowing contract)
- Demo preset buttons (one-click scripted inputs for the 3 primary demo paths)
- Exposure report one-pager rendering

**DOES NOT own:**
- Clause content (Person A)
- Audit prompt (Person A)
- Graph schema logic (Person A)

### Coordination Patterns

**The contract between A and B is the `ClauseNode` type:**
```ts
type ClauseNode = {
  id: string;                    // 'kill-fee'
  gigTypes: GigType[];           // ['design', 'software']
  title: string;                 // 'Kill Fee'
  body: string;                  // the actual clause text
  plainEnglish: string;          // 'If client cancels after v2, they pay 50% of the fee.'
  exposureWeight: number;        // 0..10 integer
  triggersWhen: (state) => bool; // when this clause becomes relevant
  dependsOn: string[];           // ['payment-terms'] — must be answered first
  questions: Question[];         // authored on-node
}
type Question = { id: string; prompt: string; field: string; inputType: 'text'|'choice'|'number'; }
```

**Person A writes clause nodes that conform to this schema. Person B writes the wizard that consumes them.** As long as both sides honor the schema, no collisions.

**Integration points (the only times A and B touch the same files):**
1. Person A delivers 2–3 sample `ClauseNode` objects by Hour 2 so Person B can build the wizard against real data (not stubs)
2. Person A delivers the audit prompt's response JSON schema by Hour 8 so Person B can build the audit UI against real output
3. End-to-end integration testing happens at Hour 16+

**Communication rule:** if you're about to change the `ClauseNode` schema or the audit response schema, FLAG IT to the other person before the change. Schema changes are the only coordination tax.

### Decision Authority

Each person has full authority over their ownership areas. If you disagree about something cross-cutting (e.g., color of the exposure dial, copy in a question prompt), the person whose ownership area it gets rendered in wins. Don't bottleneck on consensus for trivial decisions.

For non-trivial scope questions (cut a feature, change a demo flow), default to: **the more conservative option wins.** You can always add later; you can't unbreak a demo at hour 47.

---

## Locked Architecture Decisions (with reasoning)

### Stack
- **Next.js App Router + Vercel + Tailwind + Claude Sonnet 4.x API**
- One-command Vercel deploy = judges get a URL they can poke on their phones
- Streaming + form wizard patterns are trivial in this stack
- Claude Sonnet 4.x for speed + quality balance under live UX

### Why clause-graph walker (not template-driven or two-agent)
- The graph is genuinely how lawyers think about contracts — clause dependencies are real
- Dynamic routing handles gig types you didn't explicitly script
- More elegant than template-driven, less risky than two-LLM-agent under live demo conditions
- (Two-agent "interro-auditor" was considered and rejected — too much latency/consistency risk)

### Why the audit-preview flow was added (CEO-review expansion)
- It's the most differentiated angle in the landscape — almost nobody audits; everyone generates
- Two demo flows = judges see you twice
- Sets up the post-hackathon product direction

### Why React Flow graph viz was dropped (outside-voice cut)
- Two animation systems (graph + exposure dial) fighting each other in 48h is a classic hour-40 fire
- The graph viz was a "bonus whoa" — redirect those hours to audit prompt hardening
- Single animation system = less debug time, more polish budget

### Why layered prompt-injection defense (Layers 1+2+3, not single-layer)
- Audit flow processes EXTERNAL documents (client contracts) — this is an indirect-injection threat model, not just direct input. EchoLeak CVE-2025-32711 (Microsoft Copilot, June 2025) is the exact analog: malicious document content exfiltrated data when the AI summarized it.
- OWASP ranks prompt injection as LLM01:2025 (#1 AI vulnerability). Success rates 50–84% per 2025 research.
- Single-layer delimiter (`<contract>...</contract>`) is below the credible minimum per OWASP, dev.to, and Radware research — predictable delimiters are trivially escapable.
- Layered defense adds ~45–60 min vs single-layer's 5 min, and covers: input sanitization (regex strip of known attack patterns) + sandwich defense + random per-call delimiters + role anchoring + output validation (JSON schema + length bounds + no system-prompt leakage).
- Defensible in Q&A if a judge asks about security posture — which they do at every AI hackathon now.
- Full implementation details + the actual prompt template + test cases: see `clauseguard-SECURITY-DESIGN.md`.

### Why demo cache fallback is non-negotiable
- Hackathon demos die when the live API dies. Both flows need a pre-generated "if all else fails, show this" path
- The live LLM stream is the *preferred* path; the cache is the *demo-safe* path
- Build the cache switch alongside the LLM integration, not after

---

## Risks to Watch

1. **Person A overload** — clauses + audit prompt is still a lot. If at any point Person A is blocked or slipping, Person B can take on clause authoring (it's the most easily-parallelized work).
2. **Two demos, one broken** — practice both flows independently. Either can be the primary demo if the other fails.
3. **Stanford CodeX licensing** — verify the source actually has machine-readable, permissively-licensed clause text in the format needed. If not, fall back to GPT-drafted clauses labeled "illustrative — not legal advice."
4. **Exhaustion at hour 40** — sleep is the variable. The thing that kills hackathon teams is exhaustion breaking the demo at hour 47.

---

## The Differentiation Test (apply to every feature decision)

When in doubt about whether to add/cut/keep a feature, ask:

> "Does this make Clauseguard the only version of itself, or a worse version of an existing tool?"

Only-version-of-itself → keep.
Worse-version-of-something-else → cut.

---

## Source Documents (for reference)

- Full design doc: `~/.gstack/projects/francium/francium-hackathon-design-20260706-213138.md`
- Full CEO plan: `~/.gstack/projects/francium/ceo-plans/2026-07-06-clauseguard.md`
- Implementation tasks (10 items): `~/.gstack/projects/francium/tasks-ceo-review-20260706-222329.jsonl`

This brief is the team-facing summary. The source documents have more detail if you need it.
