import fireworksClient from '../providers/fireworks.provider.js';

const MODELS = {
  CLASSIFIER: process.env.CLASSIFIER_MODEL || 'accounts/fireworks/models/glm-5p2',
  GENERATOR: process.env.GENERATOR_MODEL || 'accounts/fireworks/models/glm-5p2',
};

const GIG_INTENT_SCHEMA = {
  type: "object",
  properties: {
    gigType: {
      type: "string",
      enum: ["design", "software", "marketing", "other"]
    },
    entities: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["gigType", "entities"]
};

/**
 * Flow 1: Parses the gig description to extract basic intent.
 */
export async function parseGigDescription(description) {
  const response = await fireworksClient.chat.completions.create({
    model: MODELS.CLASSIFIER,
    messages: [
      { 
        role: "system", 
        content: `Extract the gig type (e.g. software, design) and key entities from the user's input. Return as JSON matching this schema:\n${JSON.stringify(GIG_INTENT_SCHEMA, null, 2)}` 
      },
      { role: "user", content: description }
    ],
    temperature: 0.1,
    response_format: {
      type: "json_object"
    }
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Flow 1: Assembles the contract by streaming tokens.
 */
export async function generateContractStream(gigDescription, answeredState, clauseNodes) {
  // Construct context from answered questions and selected clauses
  const clauseContext = clauseNodes.map(node => 
    `Clause: ${node.title}\nText: ${node.body}`
  ).join('\n\n');

  const answersContext = Object.entries(answeredState)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  const systemPrompt = `You are a legal contract generator. Write a flowing, professional contract for a freelancer based on the gig description, their answers to specific questions, and the provided mandatory clauses. Do not simply concatenate clauses; transition smoothly.`;

  const userPrompt = `
Gig Description: ${gigDescription}

User's Answers:
${answersContext}

Mandatory Clauses:
${clauseContext}
  `.trim();

  const stream = await fireworksClient.chat.completions.create({
    model: MODELS.GENERATOR,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3,
    stream: true,
  });

  return stream;
}

/**
 * Flow 1: Writes the plain-English exposure report after the contract is generated.
 */
export async function generateExposureReport(clauseNodes, gapClauses) {
  const coverageContext = clauseNodes.map(node => 
    `- ${node.title}: ${node.plainEnglish}`
  ).join('\n');

  const gapContext = gapClauses.map(node => 
    `- MISSING: ${node.title} (Risk: ${node.plainEnglish})`
  ).join('\n');

  const EXPOSURE_REPORT_SCHEMA = {
    type: "object",
    properties: {
      summary: { type: "string", description: "Overall summary of the contract's risk profile" },
      covered: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          },
          required: ["title", "description"]
        }
      },
      missing: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            risk: { type: "string" },
            recommendation: { type: "string" }
          },
          required: ["title", "risk", "recommendation"]
        }
      }
    },
    required: ["summary", "covered", "missing"]
  };

  const response = await fireworksClient.chat.completions.create({
    model: MODELS.CLASSIFIER,
    messages: [
      { role: "system", content: `You are an expert contract auditor. Summarize the covered and missing clauses in a structured report for a freelancer. Return as JSON matching this schema:\n${JSON.stringify(EXPOSURE_REPORT_SCHEMA, null, 2)}` },
      { role: "user", content: `Covered:\n${coverageContext}\n\nGaps:\n${gapContext}` }
    ],
    temperature: 0.1,
    response_format: {
      type: "json_object"
    }
  });

  return JSON.parse(response.choices[0].message.content);
}
