import fs from 'fs';
import assert from 'assert';

const BASE_URL = 'https://kontrakt.fly.dev';
const TEST_EMAIL = `test_${Date.now()}@test.com`;
const TEST_PASSWORD = 'password123';
const PDF_PATH = '/Users/francium/Desktop/HPARC-software-development-agreement-2.pdf';

let accessToken = '';

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function register() {
  console.log('[1/5] Registering new user...');
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'E2E Tester',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Register failed: ${JSON.stringify(data)}`);
  }
  accessToken = data.data.accessToken;
  console.log('✅ Registered successfully. Token acquired.');
}

async function pollJob(jobId, operationName) {
  console.log(`Polling job ${jobId} for ${operationName}...`);
  while (true) {
    const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (res.status === 429) {
      console.log('Rate limited, backing off for 5s...');
      await delay(5000);
      continue;
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Job poll failed: ${JSON.stringify(data)}`);
    }
    
    const state = data.data.state;
    if (state === 'completed') {
      console.log(`✅ Job ${jobId} completed!`);
      return data.data.result;
    } else if (state === 'failed') {
      throw new Error(`Job ${jobId} failed: ${JSON.stringify(data.data.error)}`);
    }
    
    await delay(3000);
  }
}

async function extract() {
  console.log('[2/5] Uploading PDF for extraction...');
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`File not found: ${PDF_PATH}`);
  }
  
  const buffer = fs.readFileSync(PDF_PATH);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('contractFile', blob, 'contract.pdf');

  const res = await fetch(`${BASE_URL}/api/audit/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Extract failed: ${JSON.stringify(data)}`);
  }
  const jobId = data.jobId;
  console.log(`Extract job created: ${jobId}`);
  
  return await pollJob(jobId, 'Extract');
}

async function analyze(contractText, extractToken) {
  console.log('[3/5] Starting deep analysis...');
  const res = await fetch(`${BASE_URL}/api/audit/analyze`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Extract-Token': extractToken
    },
    body: JSON.stringify({ contractText }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Analyze failed: ${JSON.stringify(data)}`);
  }
  const jobId = data.jobId;
  console.log(`Analyze job created: ${jobId}`);
  
  return await pollJob(jobId, 'Analyze');
}

async function getHistory() {
  console.log('[4/5] Fetching audit history...');
  const res = await fetch(`${BASE_URL}/api/audit/history`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`History failed: ${JSON.stringify(data)}`);
  }
  console.log(`✅ History fetched. Total audits: ${data.pagination.total}`);
  return data.data;
}

async function run() {
  try {
    await register();
    
    const extractResult = await extract();
    console.log(`Extracted ${extractResult.pageCount} pages. Output text length: ${extractResult.text.length}`);
    
    const analysisResult = await analyze(extractResult.text, extractResult.extractToken);
    console.log(`Analysis complete! Found ${analysisResult.flags.length} flags.`);
    
    const history = await getHistory();
    assert.ok(history.length >= 1, 'History should have at least 1 item');
    assert.strictEqual(history[0].originalText, extractResult.text, 'History item matches our upload');
    
    console.log('[5/5] 🎉 All E2E tests passed successfully.');
  } catch (err) {
    console.error('❌ E2E Test Failed:', err);
    process.exit(1);
  }
}

run();
