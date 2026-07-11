import fs from 'fs';
import OpenAI from 'openai';

const base64Data = fs.readFileSync('temp_page_small.jpeg', { encoding: 'base64' });
const dataUri = `data:image/jpeg;base64,${base64Data}`;

const client = new OpenAI({
  baseURL: 'https://vessels-mutual-catalyst-tries.trycloudflare.com/v1',
  apiKey: 'no-key-needed'
});

async function run() {
  const stream = await client.chat.completions.create({
    model: 'llava-v1.6-34b.Q4_K_M.gguf',
    messages: [
      { role: 'system', content: 'You are an OCR engine. Output only the text you see in the image. Separate pages with a single form-feed character. Preserve paragraph breaks.' },
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
  console.log('\nDone.');
}

run().catch(console.error);
