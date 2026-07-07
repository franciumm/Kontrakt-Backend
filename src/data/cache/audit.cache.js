/**
 * Cached audit response for the scripted "bad client contract" demo preset.
 *
 * This is the demo-safe fallback: if the live LLM call times out or returns
 * garbage during the hackathon demo, the API switches to this cached response
 * seamlessly (see CEO_BUILD_PLAN.md — latency budget: 8s, cache fallback at 8s).
 *
 * The flags below correspond to a deliberately terrible freelance contract
 * that trips 5 of the 10 audit red-flag categories from the CEO plan.
 */

export const AUDIT_CACHE_RESPONSE = {
  flags: [
    {
      category: 'work-for-hire-trap',
      severity: 'red',
      clause_quote:
        'All work product, including preliminary sketches, drafts, concepts, and final deliverables, ' +
        'shall be considered "work made for hire" as defined under the U.S. Copyright Act and shall be ' +
        'the sole and exclusive property of the Client from the moment of creation.',
      plain_english:
        'This clause means the client owns everything you create — including rough sketches and rejected ' +
        'concepts — from the moment you put pen to paper. You can\'t use any of it in your portfolio, ' +
        'show it to future clients, or even prove you designed it. This is the single most common trap ' +
        'in freelance contracts.',
    },
    {
      category: 'unlimited-revisions',
      severity: 'red',
      clause_quote:
        'Designer shall make such revisions and modifications as Client may reasonably request until ' +
        'Client is fully satisfied with the deliverables. No additional fees shall be charged for revisions.',
      plain_english:
        'There is no cap on revisions — the client can request unlimited changes at no extra cost. ' +
        'In practice, this means a project scoped for 2 weeks can drag on for months. "Reasonably request" ' +
        'is subjective and nearly impossible to enforce. You need a hard number.',
    },
    {
      category: 'missing-kill-fee',
      severity: 'red',
      clause_quote:
        'Either party may terminate this Agreement at any time for any reason upon written notice. ' +
        'Upon termination, Client shall pay Designer for work completed to date.',
      plain_english:
        'There is no kill fee. If the client cancels at round 3, you get paid only for "work completed ' +
        'to date" — which is subjective and often disputed. You turned down other clients for this project. ' +
        'A proper kill fee (25–50% of the total) compensates for that opportunity cost.',
    },
    {
      category: 'vague-scope',
      severity: 'yellow',
      clause_quote:
        'Designer shall provide logo design services and related branding deliverables as discussed ' +
        'between the parties.',
      plain_english:
        'The scope of work is dangerously vague. "As discussed between the parties" is not a deliverables ' +
        'list — it leaves room for the client to claim you owe them a full brand identity when you quoted ' +
        'for a logo. Every deliverable should be explicitly named: logo, business card, letterhead, brand ' +
        'guidelines, etc.',
    },
    {
      category: 'ip-transfer-timing',
      severity: 'yellow',
      clause_quote:
        'Upon execution of this Agreement, all intellectual property rights in the deliverables shall ' +
        'transfer to Client. Designer shall execute any documents necessary to effectuate such transfer.',
      plain_english:
        'IP transfers the moment you sign — before you\'ve been paid a single dollar. If the client ' +
        'never pays, they still legally own the work. The transfer should be conditional on receipt of ' +
        'full and final payment.',
    },
  ],
};
