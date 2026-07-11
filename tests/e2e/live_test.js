import fs from 'fs';
import path from 'path';

const API_BASE = 'https://kontrakt.fly.dev/api';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('--- Starting E2E Test ---');

  // 1. Register a new user
  const email = `test_${Date.now()}@example.com`;
  const password = 'Password123!';
  console.log(`\n[1] Registering user ${email}...`);
  
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Tester', email, password })
  });
  
  if (!regRes.ok) {
    throw new Error(`Register failed: ${await regRes.text()}`);
  }
  const regData = await regRes.json();
  const accessToken = regData.data.accessToken;
  console.log('User registered. Access Token acquired.');

  // 2. Upload contract for extraction
  console.log('\n[2] Uploading contract for extraction...');
  const filePath = '/Users/francium/Desktop/HPARC-software-development-agreement-2.pdf';
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const fileBuffer = fs.readFileSync(filePath);
  const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
  
  const formData = new FormData();
  formData.append('contractFile', fileBlob, 'HPARC-software-development-agreement-2.pdf');
  
  const extractRes = await fetch(`${API_BASE}/audit/extract`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
      // Note: FormData handles Content-Type automatically with boundary
    },
    body: formData
  });

  if (!extractRes.ok) {
    throw new Error(`Extract failed: ${await extractRes.text()}`);
  }
  
  const extractData = await extractRes.json();
  const extractJobId = extractData.jobId;
  console.log(`Extract job created: ${extractJobId}`);

  // 3. Poll extract job
  console.log('\n[3] Polling extract job...');
  let extractResult = null;
  while (true) {
    const jobRes = await fetch(`${API_BASE}/jobs/${extractJobId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const jobData = await jobRes.json();
    console.log(`Job status: ${jobData.data.status}`);
    
    if (jobData.data.state === 'complete') {
      extractResult = jobData.data.result;
      break;
    } else if (jobData.data.state === 'failed') {
      throw new Error(`Job failed: ${JSON.stringify(jobData.data.error)}`);
    }
    
    await delay(3000);
  }
  
  const contractText = extractResult.text;
  const extractToken = extractResult.extractToken;
  console.log(`Extraction complete. Extracted ${contractText.length} characters.`);
  console.log(`Received X-Extract-Token: ${extractToken.substring(0, 20)}...`);

  // 4. Analyze contract
  console.log('\n[4] Submitting for analysis...');
  const analyzeRes = await fetch(`${API_BASE}/audit/analyze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Extract-Token': extractToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractText })
  });
  
  if (!analyzeRes.ok) {
    throw new Error(`Analyze failed: ${await analyzeRes.text()}`);
  }
  
  const analyzeData = await analyzeRes.json();
  const analyzeJobId = analyzeData.jobId;
  console.log(`Analyze job created: ${analyzeJobId}`);

  // 5. Poll analyze job
  console.log('\n[5] Polling analyze job...');
  let analyzeResult = null;
  while (true) {
    const jobRes = await fetch(`${API_BASE}/jobs/${analyzeJobId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const jobData = await jobRes.json();
    console.log(`Job status: ${jobData.data.status}`);
    
    if (jobData.data.state === 'complete') {
      analyzeResult = jobData.data.result;
      break;
    } else if (jobData.data.state === 'failed') {
      throw new Error(`Job failed: ${JSON.stringify(jobData.data.error)}`);
    }
    
    await delay(3000);
  }
  
  console.log('Analysis complete. Number of flags found:', analyzeResult.flags?.length || 0);

  // 6. Get Audit History
  console.log('\n[6] Fetching audit history...');
  const historyRes = await fetch(`${API_BASE}/audit/history`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!historyRes.ok) {
    throw new Error(`History fetch failed: ${await historyRes.text()}`);
  }
  
  const historyData = await historyRes.json();
  console.log(`Found ${historyData.data.length} items in history.`);
  
  if (historyData.data.length > 0) {
    const firstAuditId = historyData.data[0]._id;
    console.log(`\n[7] Fetching specific audit result: ${firstAuditId}`);
    
    const specificRes = await fetch(`${API_BASE}/audit/${firstAuditId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!specificRes.ok) {
      throw new Error(`Specific audit fetch failed: ${await specificRes.text()}`);
    }
    
    const specificData = await specificRes.json();
    console.log(`Successfully fetched audit for ID: ${specificData.data._id}`);
  }

  console.log('\n--- E2E Test Completed Successfully ---');
}

run().catch(console.error);
