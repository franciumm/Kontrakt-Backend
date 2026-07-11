import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const base64Data = fs.readFileSync('temp_page.jpeg', { encoding: 'base64' });
const dataUri = `data:image/jpeg;base64,${base64Data}`;

const client = new OpenAI({
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: process.env.FIREWORKS_API_KEY
});

async function run() {
  console.log('Testing Fireworks Vision Model...');
  const stream = await client.chat.completions.create({
    model: 'accounts/fireworks/models/llama-v3p2-90b-vision-instruct',
    messages: [
      { role: 'system', content: 'You are an OCR engine. Output only the text you see in the image.' },
      { role: 'user', content: [
          { type: 'image_url', image_url: { url: dataUri } },
          { type: 'text', text: '--- Begin page 1 of 1. Transcribe this page verbatim. ---\n\n--- End of page. Output the verbatim transcription now. ---' }
      ]}
    ],
    temperature: 0,
    max_tokens: 2048,
    stream: true
  });

  let text = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(delta);
    text += delta;
  }
  console.log('\n\n✅ Done testing extraction.');
  
  // Now test deep audit with extracted text
  console.log('Testing Deep Audit on the extracted text...');
  
  // deepAuditContract from src/services/audit.service.js
  const { deepAuditContract } = await import('./src/services/audit.service.js');
  const result = await deepAuditContract(text);
  console.dir(result.flags, { depth: null });
  console.log('✅ Deep Audit completed successfully.');
}

run().catch(console.error);
