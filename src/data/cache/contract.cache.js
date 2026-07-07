/**
 * Cached contract response for the scripted "logo design" demo preset.
 *
 * This is the demo-safe fallback for the interrogator flow: if the live LLM
 * call times out during the hackathon demo, the API seamlessly returns this
 * pre-generated contract + exposure report.
 *
 * The contract below assumes a logo design gig with the following answered state:
 *   totalFee: 3500, netDays: 15, killFeePercent: 50, revisionRounds: 3,
 *   revisionRate: 250, retainPortfolioRights: "yes", usageScope: "digital and print marketing",
 *   initialDays: 7, finalDays: 10, jurisdiction: "New York, NY"
 */

export const CONTRACT_CACHE_RESPONSE = {
  contract: `FREELANCE DESIGN SERVICES AGREEMENT

This Freelance Design Services Agreement ("Agreement") is entered into as of [DATE] by and between:

Client: [CLIENT_NAME] ("Client")
Designer: [DESIGNER_NAME] ("Designer")

Collectively referred to as the "Parties."


1. PAYMENT TERMS

Client shall pay Designer a total fee of $3,500.00 for the Services described herein. Payment shall be made in two installments: fifty percent ($1,750.00) due upon execution of this Agreement as a non-refundable deposit, and the remaining fifty percent ($1,750.00) due upon delivery of the final approved deliverables. All invoices are payable within fifteen (15) calendar days of receipt. Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, whichever is less.


2. CANCELLATION & KILL FEE

If Client terminates this Agreement prior to completion of the Services, Client shall pay Designer a kill fee equal to fifty percent (50%) of the total project fee ($1,750.00), plus full payment for all work completed and expenses incurred through the date of termination. The non-refundable deposit described in Section 1 shall be credited toward the kill fee. Upon payment of the kill fee, Designer shall deliver all work-in-progress files to Client in their current state.


3. REVISION LIMITS

The total project fee includes up to three (3) rounds of revisions per deliverable. Each revision round shall consist of a single consolidated set of feedback provided by Client within five (5) business days of receiving a draft. Additional revision rounds beyond the included three shall be billed at $250.00 per round. Failure by Client to provide feedback within the specified period shall constitute approval of the current draft.


4. INTELLECTUAL PROPERTY

Upon receipt of full and final payment, Designer hereby assigns to Client all right, title, and interest in and to the final approved deliverables, including all intellectual property rights therein. Prior to receipt of full payment, all intellectual property rights in the work shall remain with Designer. Designer retains the right to display the work in portfolios, case studies, and award submissions, including on Designer's website and social media channels. All preliminary concepts, sketches, and rejected drafts remain the property of Designer and shall not be used by Client.


5. USAGE RIGHTS

The intellectual property assignment in this Agreement grants Client the right to use the final deliverables for digital and print marketing purposes. Use of the deliverables beyond the specified scope requires a separate licensing agreement and additional compensation to Designer. The deliverables may not be resold, sublicensed, or distributed as stock assets, design templates, or merchandise without Designer's prior written consent and a separate royalty arrangement.


6. TIMELINE & DELIVERY

Designer shall deliver the initial concepts within seven (7) business days of receiving the creative brief and non-refundable deposit. The final deliverables shall be completed within ten (10) business days of Client's approval of the selected concept, contingent upon timely Client feedback as specified in Section 3. Delivery timelines may be extended by the number of days Client delays in providing required materials, feedback, or approvals. Final deliverables shall be provided in AI, SVG, PNG, and PDF formats.


7. DISPUTE RESOLUTION

Any dispute arising out of or relating to this Agreement shall first be submitted to good-faith mediation administered by a mutually agreed-upon mediator. If mediation fails to resolve the dispute within thirty (30) calendar days, either party may pursue binding arbitration under the rules of the American Arbitration Association in New York, NY. The prevailing party in any dispute shall be entitled to recover reasonable attorneys' fees and costs from the non-prevailing party.


8. GENERAL PROVISIONS

This Agreement constitutes the entire agreement between the Parties and supersedes all prior negotiations, representations, or agreements relating to the subject matter hereof. This Agreement may not be amended except by a written instrument signed by both Parties. If any provision of this Agreement is held to be unenforceable, the remaining provisions shall remain in full force and effect.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.


_______________________________          _______________________________
Client Signature                         Designer Signature
[CLIENT_NAME]                            [DESIGNER_NAME]
Date: ____________                       Date: ____________`,

  exposureReport: [
    {
      clause: 'Payment Terms',
      covered: true,
      plainEnglish:
        'You get $1,750 up front as a non-refundable deposit and $1,750 on delivery. ' +
        'Late payments accrue 1.5% monthly interest. You\'re covered.',
    },
    {
      clause: 'Kill Fee / Cancellation',
      covered: true,
      plainEnglish:
        'If the client cancels, they owe you 50% of the total ($1,750) plus pay for work done. ' +
        'Your deposit counts toward the kill fee. You\'re protected against ghosting.',
    },
    {
      clause: 'Revision Limits',
      covered: true,
      plainEnglish:
        '3 rounds included, $250 per extra round. If they don\'t respond within 5 business days, ' +
        'the draft is auto-approved. No unlimited-revisions trap.',
    },
    {
      clause: 'Intellectual Property',
      covered: true,
      plainEnglish:
        'IP only transfers after full payment. You keep portfolio rights. ' +
        'Rejected concepts stay yours. This is the gold standard for designers.',
    },
    {
      clause: 'Usage Rights',
      covered: true,
      plainEnglish:
        'Client can use deliverables for digital and print marketing only. ' +
        'Resale, merchandise, and sublicensing require separate agreements and payment.',
    },
    {
      clause: 'Timeline & Delivery',
      covered: true,
      plainEnglish:
        '7 business days for initial concepts, 10 for finals. ' +
        'The clock pauses when the client is slow — their delays don\'t penalize you.',
    },
    {
      clause: 'Dispute Resolution',
      covered: true,
      plainEnglish:
        'Mediation first, then arbitration in New York, NY. ' +
        'Loser pays legal fees. No surprise jurisdiction in the client\'s hometown.',
    },
    {
      clause: 'Late-Payment Penalty',
      covered: false,
      plainEnglish:
        'While your Payment Terms include interest on late payments, there is no escalation clause ' +
        '(e.g., work suspension after 30 days overdue). Consider adding a work-stoppage trigger.',
    },
    {
      clause: 'Indemnification',
      covered: false,
      plainEnglish:
        'This contract does not include mutual indemnification. If the client uses your work in a way ' +
        'that gets them sued, there\'s no clause protecting you. Consider adding a mutual indemnification clause.',
    },
  ],
};
