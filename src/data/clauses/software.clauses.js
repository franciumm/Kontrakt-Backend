/**
 * ClauseNode library — Software Development gig type
 *
 * Each node follows the locked schema from DESIGN.md:
 *   { id, gigTypes, title, body, plainEnglish, exposureWeight,
 *     triggersWhen, dependsOn, questions }
 *
 * Dependency chain:
 *   payment-terms (root)
 *     ├── kill-fee
 *     ├── scope-of-work
 *     │     └── acceptance-testing
 *     ├── intellectual-property
 *     ├── warranty-support
 *     └── confidentiality-nda
 */

export const softwareClauses = [
  // ──────────────────────────────────────────────
  // 1. Payment Terms  (root — no dependencies)
  // ──────────────────────────────────────────────
  {
    id: 'payment-terms',
    gigTypes: ['software'],
    title: 'Payment Terms',
    body:
      'Client shall pay Developer a total fee of [FEE_AMOUNT] for the Services described herein. ' +
      'Payment shall be structured as follows: [DEPOSIT_PERCENT]% due upon execution of this Agreement ' +
      'as a non-refundable deposit, with the remaining balance invoiced upon completion of each milestone ' +
      'as defined in the Scope of Work. All invoices are payable within [NET_DAYS] calendar days of receipt. ' +
      'Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, ' +
      'whichever is less. Developer reserves the right to suspend work on any milestone for which the ' +
      'preceding milestone payment remains outstanding.',
    plainEnglish:
      `You get a deposit before starting and milestone payments as you deliver. ' +
      'If they don't pay for a milestone, you can pause work until they do.`,
    exposureWeight: 10,
    triggersWhen: (_state) => true,
    dependsOn: [],
    questions: [
      {
        id: 'payment-terms-fee',
        prompt: 'What is the total project fee?',
        field: 'totalFee',
        inputType: 'number',
      },
      {
        id: 'payment-terms-net',
        prompt: 'How many days should the client have to pay each invoice? (e.g. 15, 30)',
        field: 'netDays',
        inputType: 'number',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 2. Kill Fee / Cancellation
  // ──────────────────────────────────────────────
  {
    id: 'kill-fee',
    gigTypes: ['software'],
    title: 'Kill Fee / Cancellation',
    body:
      'If Client terminates this Agreement prior to completion of the Services, Client shall pay Developer ' +
      'a kill fee equal to [KILL_FEE_PERCENT]% of the total project fee, plus full compensation for all ' +
      'completed milestones and any work-in-progress at the hourly rate of [HOURLY_RATE] per hour. ' +
      'The non-refundable deposit shall be credited toward the kill fee. Upon payment, Developer shall ' +
      'deliver all source code, documentation, and work-in-progress to Client in their current state. ' +
      'Either party may terminate this Agreement for cause with fourteen (14) calendar days\' written notice ' +
      'if the other party materially breaches and fails to cure within the notice period.',
    plainEnglish:
      'If the client pulls the plug, they owe you for work done plus a cancellation fee. ' +
      'You hand over whatever code exists at that point.',
    exposureWeight: 9,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'kill-fee-percent',
        prompt: 'What percentage of the total fee should the kill fee be? (e.g. 25, 50)',
        field: 'killFeePercent',
        inputType: 'number',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 3. Scope of Work
  // ──────────────────────────────────────────────
  {
    id: 'scope-of-work',
    gigTypes: ['software'],
    title: 'Scope of Work',
    body:
      'Developer shall design, develop, and deliver the software application described as: [PROJECT_DESCRIPTION]. ' +
      'The deliverables include: [DELIVERABLES_LIST]. Work not explicitly listed in this Scope of Work is ' +
      'considered out-of-scope and shall require a written change order signed by both parties before work ' +
      'commences. Change orders may adjust the project fee, timeline, or both. Client acknowledges that ' +
      'verbal requests, emails, or chat messages do not constitute authorized change orders. Developer shall ' +
      'provide a written estimate for any out-of-scope work within five (5) business days of Client\'s request.',
    plainEnglish:
      `This nails down exactly what you're building. Anything the client adds later ` +
      `requires a signed change order with a new price — no free scope creep.`,
    exposureWeight: 9,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'scope-description',
        prompt: 'Briefly describe the software you are building.',
        field: 'projectDescription',
        inputType: 'text',
      },
      {
        id: 'scope-deliverables',
        prompt: 'List the key deliverables (e.g. "web app, REST API, admin dashboard, deployment scripts").',
        field: 'deliverablesList',
        inputType: 'text',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 4. Intellectual Property
  // ──────────────────────────────────────────────
  {
    id: 'intellectual-property',
    gigTypes: ['software'],
    title: 'Intellectual Property Ownership',
    body:
      'Upon receipt of full and final payment, Developer hereby assigns to Client all right, title, and ' +
      'interest in and to the custom source code and documentation created specifically for this project ' +
      '(the "Custom Code"). Prior to receipt of full payment, all intellectual property rights in the ' +
      'Custom Code shall remain with Developer. Developer retains all rights to pre-existing code, libraries, ' +
      'frameworks, and tools used in the project (the "Developer Tools"), and hereby grants Client a ' +
      'non-exclusive, perpetual, royalty-free license to use the Developer Tools solely as embedded in the ' +
      'deliverables. Developer may reuse general-purpose techniques, patterns, and non-client-specific code ' +
      'in future projects.',
    plainEnglish:
      'The client owns the custom code you write — but only after they pay in full. ' +
      'Your pre-existing tools and libraries stay yours; they just get a license to use them in the project.',
    exposureWeight: 10,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'ip-preexisting',
        prompt: 'Are you bringing any pre-existing code or libraries that should remain yours?',
        field: 'hasPreexistingCode',
        inputType: 'choice',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 5. Acceptance Testing
  // ──────────────────────────────────────────────
  {
    id: 'acceptance-testing',
    gigTypes: ['software'],
    title: 'Acceptance Testing & Approval',
    body:
      'Upon delivery of each milestone, Client shall have [REVIEW_DAYS] business days to review, test, ' +
      'and either accept or reject the deliverables in writing (the "Acceptance Period"). Rejection must ' +
      'include a detailed written description of deficiencies referencing specific requirements from the ' +
      'Scope of Work. Developer shall correct verified deficiencies within [FIX_DAYS] business days at no ' +
      'additional charge. If Client fails to provide written acceptance or rejection within the Acceptance ' +
      'Period, the deliverables shall be deemed accepted. Feature requests, enhancements, or changes to ' +
      'requirements submitted during the Acceptance Period are not deficiencies and shall be handled as ' +
      'change orders.',
    plainEnglish:
      `The client gets a set number of days to test each milestone. If they don't respond, ` +
      `it's automatically approved. Bug fixes are free; new features are change orders.`,
    exposureWeight: 7,
    triggersWhen: (state) => state.projectDescription !== undefined,
    dependsOn: ['scope-of-work'],
    questions: [
      {
        id: 'acceptance-review-days',
        prompt: 'How many business days should the client have to review each milestone?',
        field: 'reviewDays',
        inputType: 'number',
      },
      {
        id: 'acceptance-fix-days',
        prompt: 'How many business days will you take to fix verified deficiencies?',
        field: 'fixDays',
        inputType: 'number',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 6. Warranty & Support
  // ──────────────────────────────────────────────
  {
    id: 'warranty-support',
    gigTypes: ['software'],
    title: 'Warranty & Post-Delivery Support',
    body:
      'Developer warrants that the delivered software shall perform materially in accordance with the ' +
      'Scope of Work for a period of [WARRANTY_DAYS] calendar days following final acceptance (the ' +
      '"Warranty Period"). During the Warranty Period, Developer shall correct any reproducible defects ' +
      'at no additional charge. This warranty does not cover defects caused by Client modifications, ' +
      'third-party integrations not specified in the Scope of Work, or use of the software in an ' +
      'environment other than the specified deployment target. Post-warranty support, maintenance, and ' +
      'hosting are not included and may be arranged under a separate maintenance agreement.',
    plainEnglish:
      `You guarantee the software works as described for a set period after delivery. ` +
      `You'll fix real bugs for free, but not issues caused by the client's own changes.`,
    exposureWeight: 6,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'warranty-days',
        prompt: 'How many days of post-delivery bug-fix warranty do you offer? (e.g. 30, 60, 90)',
        field: 'warrantyDays',
        inputType: 'number',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 7. Confidentiality / NDA
  // ──────────────────────────────────────────────
  {
    id: 'confidentiality-nda',
    gigTypes: ['software'],
    title: 'Confidentiality & Non-Disclosure',
    body:
      'Each party agrees to hold in confidence all Confidential Information received from the other party ' +
      'during the term of this Agreement. "Confidential Information" includes business plans, technical ' +
      'specifications, user data, API keys, credentials, trade secrets, and any information marked as ' +
      'confidential. Confidential Information does not include information that: (a) is or becomes publicly ' +
      'available through no fault of the receiving party; (b) was rightfully known prior to disclosure; ' +
      '(c) is independently developed without use of the disclosing party\'s information; or (d) is required ' +
      'to be disclosed by law. This confidentiality obligation survives termination of this Agreement for a ' +
      'period of [NDA_YEARS] year(s).',
    plainEnglish:
      `Both sides keep each other's secrets. Standard exceptions apply — public info, ` +
      `stuff you already knew, and legal requirements. The obligation lasts after the project ends.`,
    exposureWeight: 5,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'nda-years',
        prompt: 'How many years should the confidentiality obligation last after the project ends?',
        field: 'ndaYears',
        inputType: 'number',
      },
    ],
  },
];
