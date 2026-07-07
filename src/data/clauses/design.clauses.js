/**
 * ClauseNode library — Logo / Design gig type
 *
 * Each node follows the locked schema from DESIGN.md:
 *   { id, gigTypes, title, body, plainEnglish, exposureWeight,
 *     triggersWhen, dependsOn, questions }
 *
 * Dependency chain:
 *   payment-terms (root)
 *     ├── kill-fee
 *     ├── revision-limits
 *     ├── intellectual-property
 *     │     └── usage-rights
 *     ├── timeline-delivery
 *     └── dispute-resolution
 */

export const designClauses = [
  // ──────────────────────────────────────────────
  // 1. Payment Terms  (root — no dependencies)
  // ──────────────────────────────────────────────
  {
    id: 'payment-terms',
    gigTypes: ['design'],
    title: 'Payment Terms',
    body:
      'Client shall pay Designer a total fee of [FEE_AMOUNT] for the Services described herein. ' +
      'Payment shall be made in two installments: fifty percent (50%) due upon execution of this Agreement ' +
      'as a non-refundable deposit, and the remaining fifty percent (50%) due upon delivery of the final ' +
      'deliverables. All invoices are payable within [NET_DAYS] calendar days of receipt. Late payments ' +
      'shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, whichever is less.',
    plainEnglish:
      'You get half up front before you start working, and half when you deliver. ' +
      'If they pay late, they owe you interest.',
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
  // 2. Kill Fee
  // ──────────────────────────────────────────────
  {
    id: 'kill-fee',
    gigTypes: ['design'],
    title: 'Kill Fee / Cancellation',
    body:
      'If Client terminates this Agreement prior to completion of the Services, Client shall pay Designer ' +
      'a kill fee equal to [KILL_FEE_PERCENT]% of the total project fee, plus full payment for all work ' +
      'completed and expenses incurred through the date of termination. The non-refundable deposit described ' +
      'in the Payment Terms section shall be credited toward the kill fee. Upon payment of the kill fee, ' +
      'Designer shall deliver all work-in-progress files to Client in their current state.',
    plainEnglish:
      `If the client cancels mid-project, you still get paid for the work you've done ` +
      `plus a cancellation fee. Your deposit counts toward that.`,
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
  // 3. Revision Limits
  // ──────────────────────────────────────────────
  {
    id: 'revision-limits',
    gigTypes: ['design'],
    title: 'Revision Limits',
    body:
      'The total project fee includes up to [REVISION_ROUNDS] rounds of revisions per deliverable. ' +
      'Each revision round shall consist of a single consolidated set of feedback provided by Client ' +
      'within [FEEDBACK_DAYS] business days of receiving a draft. Additional revision rounds beyond ' +
      'the included amount shall be billed at [REVISION_RATE] per round. Failure by Client to provide ' +
      'feedback within the specified period shall constitute approval of the current draft.',
    plainEnglish:
      `You include a set number of revision rounds in your price. ' +
      'Extra rounds cost extra. If they ghost your draft, it\\'s considered approved.`,
    exposureWeight: 8,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'revision-rounds',
        prompt: 'How many rounds of revisions are included in the fee?',
        field: 'revisionRounds',
        inputType: 'number',
      },
      {
        id: 'revision-rate',
        prompt: 'What do you charge per additional revision round? (dollar amount)',
        field: 'revisionRate',
        inputType: 'number',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 4. Intellectual Property
  // ──────────────────────────────────────────────
  {
    id: 'intellectual-property',
    gigTypes: ['design'],
    title: 'Intellectual Property Ownership',
    body:
      'Upon receipt of full and final payment, Designer hereby assigns to Client all right, title, and ' +
      'interest in and to the final approved deliverables, including all intellectual property rights therein. ' +
      'Prior to receipt of full payment, all intellectual property rights in the work shall remain with Designer. ' +
      'Designer retains the right to display the work in portfolios, case studies, and award submissions, ' +
      'including on Designer\'s website and social media channels. All preliminary concepts, sketches, and ' +
      'rejected drafts remain the property of Designer and shall not be used by Client.',
    plainEnglish:
      `The client only owns the final work after they've paid in full. ' +
      'You keep the right to show it in your portfolio. Rejected concepts stay yours.`,
    exposureWeight: 10,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'ip-portfolio',
        prompt: 'Do you need to retain portfolio rights to display this work publicly?',
        field: 'retainPortfolioRights',
        inputType: 'choice',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 5. Usage Rights
  // ──────────────────────────────────────────────
  {
    id: 'usage-rights',
    gigTypes: ['design'],
    title: 'Usage Rights & Licensing',
    body:
      'The intellectual property assignment in this Agreement grants Client the right to use the final ' +
      'deliverables for [USAGE_SCOPE]. Use of the deliverables beyond the specified scope requires a ' +
      'separate licensing agreement and additional compensation to Designer. For the avoidance of doubt, ' +
      'the deliverables may not be resold, sublicensed, or distributed as stock assets, design templates, ' +
      'or merchandise without Designer\'s prior written consent and a separate royalty arrangement.',
    plainEnglish:
      `'The client can only use your work for the specific purpose you agree on. ' +
      'They can't resell it or turn it into merchandise without paying you more.`,
    exposureWeight: 7,
    triggersWhen: (state) => state.retainPortfolioRights !== undefined,
    dependsOn: ['intellectual-property'],
    questions: [
      {
        id: 'usage-scope',
        prompt:
          'What is the intended usage scope for the deliverables? (e.g. "digital and print marketing", "all commercial purposes")',
        field: 'usageScope',
        inputType: 'text',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 6. Timeline & Delivery
  // ──────────────────────────────────────────────
  {
    id: 'timeline-delivery',
    gigTypes: ['design'],
    title: 'Timeline & Delivery',
    body:
      'Designer shall deliver the initial concepts within [INITIAL_DAYS] business days of receiving the ' +
      'creative brief and non-refundable deposit. The final deliverables shall be completed within ' +
      '[FINAL_DAYS] business days of Client\'s approval of the selected concept, contingent upon timely ' +
      'Client feedback as specified in the Revision Limits section. Delivery timelines are estimates and ' +
      'may be extended by the number of days Client delays in providing required materials, feedback, or ' +
      'approvals. Final deliverables shall be provided in [FILE_FORMATS] format(s).',
    plainEnglish:
      `You commit to a delivery schedule, but the clock pauses whenever the client ' +
      'is slow to respond. Delays on their end don't penalize you.`,
    exposureWeight: 6,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'timeline-initial',
        prompt: 'How many business days to deliver initial concepts after receiving the brief?',
        field: 'initialDays',
        inputType: 'number',
      },
      {
        id: 'timeline-final',
        prompt: 'How many business days to deliver finals after concept approval?',
        field: 'finalDays',
        inputType: 'number',
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 7. Dispute Resolution
  // ──────────────────────────────────────────────
  {
    id: 'dispute-resolution',
    gigTypes: ['design'],
    title: 'Dispute Resolution',
    body:
      'Any dispute arising out of or relating to this Agreement shall first be submitted to good-faith ' +
      'mediation administered by a mutually agreed-upon mediator. If mediation fails to resolve the dispute ' +
      'within thirty (30) calendar days, either party may pursue binding arbitration under the rules of the ' +
      'American Arbitration Association in [JURISDICTION]. The prevailing party in any dispute shall be entitled ' +
      'to recover reasonable attorneys\' fees and costs from the non-prevailing party. Each party waives the ' +
      'right to participate in a class action or class-wide arbitration.',
    plainEnglish:
      `If there's a disagreement, you try mediation first. If that fails, ` +
      `it goes to arbitration in your preferred location — and the loser pays legal fees.`,
    exposureWeight: 5,
    triggersWhen: (state) => state.totalFee !== undefined,
    dependsOn: ['payment-terms'],
    questions: [
      {
        id: 'dispute-jurisdiction',
        prompt: 'In which city and state should disputes be resolved?',
        field: 'jurisdiction',
        inputType: 'text',
      },
    ],
  },
];
