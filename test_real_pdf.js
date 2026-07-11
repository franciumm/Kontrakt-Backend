import fs from 'fs';

const API_BASE = 'https://kontrakt.fly.dev/api';
const EMAIL = `qa_prod_${Date.now()}@example.com`;
const PASSWORD = 'Password123!';

async function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function pollJob(jobId, accessToken, name) {
  console.log(`Polling ${name} job: ${jobId}...`);
  while (true) {
    const jobRes = await fetch(`${API_BASE}/jobs/${jobId}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const jobData = await jobRes.json();
    if (jobData.data.state === 'complete') {
      console.log(`✅ ${name} Job complete.`);
      return jobData.data.result;
    } else if (jobData.data.state === 'failed') {
      throw new Error(`${name} Job failed: ${JSON.stringify(jobData.data.error)}`);
    }
    await delay(3000);
  }
}

async function run() {
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Prod PDF Tester', email: EMAIL, password: PASSWORD })
  });
  const accessToken = (await regRes.json()).data.accessToken;
  console.log('Registered User on Prod.');

  const base64Data = fs.readFileSync('temp_page_small.jpeg', { encoding: 'base64' });
  const dataUri = `data:image/jpeg;base64,${base64Data}`;

  const extractRes = await fetch(`${API_BASE}/audit/extract`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: [dataUri] })
  });
  if (!extractRes.ok) throw new Error('Extract request failed: ' + await extractRes.text());
  
  const extractJobId = (await extractRes.json()).jobId;
  const extractResult = await pollJob(extractJobId, accessToken, 'Extract PDF (Prod)');
  
  console.log('\n--- EXTRACTED TEXT ---');
  console.log(extractResult.text);
  console.log('----------------------\n');
  
  const analyzeRes = await fetch(`${API_BASE}/audit/analyze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Extract-Token': extractResult.extractToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractText: extractResult.text })
  });
  
  if (!analyzeRes.ok) {
     console.error('Analyze request failed:', await analyzeRes.text());
  } else {
     const analyzeJobId = (await analyzeRes.json()).jobId;
     const analyzeResult = await pollJob(analyzeJobId, accessToken, 'Deep Audit (Prod)');
     console.log('✅ Deep Audit completed. Flags:');
     console.dir(analyzeResult.flags, { depth: null });
  }
}

run().catch(console.error);
