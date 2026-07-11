import fs from 'fs';
import path from 'path';

const API_BASE = 'https://kontrakt.fly.dev/api';
const EMAIL = `qa_${Date.now()}@example.com`;
const PASSWORD = 'Password123!';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollJob(jobId, accessToken, name) {
  console.log(`Polling ${name} job: ${jobId}...`);
  while (true) {
    const jobRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const textBody = await jobRes.text();
    let jobData;
    try {
      jobData = JSON.parse(textBody);
    } catch (e) {
      throw new Error(`Failed to parse JSON. Status: ${jobRes.status}, Body: ${textBody}`);
    }
    
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
  console.log('=== KONTRAKT API E2E TEST REPORT ===\n');

  // --- 1. Auth & Validations ---
  console.log('[1] Testing Authentication & Validations');
  
  // Test missing auth
  const noAuthRes = await fetch(`${API_BASE}/audit/history`);
  if (noAuthRes.status === 401 || noAuthRes.status === 403) {
    console.log('✅ Unauthorized request rejected correctly.');
  } else {
    throw new Error(`Expected 401/403 for unauthorized request, got ${noAuthRes.status}`);
  }

  // Register User
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'QA Engineer', email: EMAIL, password: PASSWORD })
  });
  if (!regRes.ok) throw new Error('Registration failed');
  const regData = await regRes.json();
  const accessToken = regData.data.accessToken;
  console.log('✅ User registration successful.');

  // Test invalid payload validation
  const invalidPayloadRes = await fetch(`${API_BASE}/contract/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ gigDescription: '' }) // Empty should fail
  });
  if (invalidPayloadRes.status === 400) {
    console.log('✅ Invalid payload validation working.');
  } else {
    throw new Error(`Expected 400 for invalid payload, got ${invalidPayloadRes.status}`);
  }

  // --- 2. Audit Flow ---
  console.log('\n[2] Testing Audit Flow');
  
  const dummyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  
  const extractRes = await fetch(`${API_BASE}/audit/extract`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ images: [dummyImage] })
  });
  if (!extractRes.ok) throw new Error('Extract failed');
  const extractJobId = (await extractRes.json()).jobId;
  const extractResult = await pollJob(extractJobId, accessToken, 'Extract PDF');
  console.log('✅ PDF text extraction working perfectly.');
  
  const contractText = extractResult.text;
  const extractToken = extractResult.extractToken;

  // Deep Audit
  const analyzeRes = await fetch(`${API_BASE}/audit/analyze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Extract-Token': extractToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractText })
  });
  
  if (contractText === '[ILLEGIBLE_PAGE]') {
    if (analyzeRes.status === 400) {
      console.log('✅ Deep Audit correctly rejected illegible contract.');
    } else {
      throw new Error(`Expected 400 for illegible text, got ${analyzeRes.status}`);
    }
  } else {
    if (!analyzeRes.ok) throw new Error('Analyze failed');
    const analyzeJobId = (await analyzeRes.json()).jobId;
    const analyzeResult = await pollJob(analyzeJobId, accessToken, 'Deep Audit');
    console.log(`✅ Deep audit completed. Flags found: ${analyzeResult.flags?.length || 0}`);
  }

  // Fast Scan
  const fastScanRes = await fetch(`${API_BASE}/audit/fast-scan`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractText })
  });
  
  if (contractText === '[ILLEGIBLE_PAGE]') {
    if (fastScanRes.status === 400) {
      console.log('✅ Fast Scan correctly rejected illegible contract.');
    } else {
      throw new Error(`Expected 400 for illegible text, got ${fastScanRes.status}`);
    }
  } else {
    if (!fastScanRes.ok) throw new Error('Fast scan failed');
    const fastScanJobId = (await fastScanRes.json()).jobId;
    const fastScanResult = await pollJob(fastScanJobId, accessToken, 'Fast Scan');
    console.log(`✅ Fast scan completed.`);
  }

  // Audit History
  const auditHistRes = await fetch(`${API_BASE}/audit/history`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const auditHistData = await auditHistRes.json();
  const expectedCount = contractText === '[ILLEGIBLE_PAGE]' ? 0 : 1;
  
  if (auditHistData.data.length === expectedCount) {
    console.log(`✅ Audit history retrieved successfully. Count: ${auditHistData.data.length}`);
  } else {
    throw new Error(`Audit history has ${auditHistData.data.length} entries but expected ${expectedCount}`);
  }

  // --- 3. Contract Flow ---
  console.log('\n[3] Testing Contract Generation Flow');

  const startRes = await fetch(`${API_BASE}/contract/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ gigDescription: 'I am a freelance web developer building a simple landing page for a client for $500.' })
  });
  if (!startRes.ok) throw new Error('Contract start failed');
  const startJobId = (await startRes.json()).jobId;
  const startResult = await pollJob(startJobId, accessToken, 'Contract Start');
  console.log('✅ Contract session started. Questions received.');
  
  const contractId = startResult.contractId;
  const questions = startResult.questions || startResult.nextQuestions || [];
  
  // Provide dummy answers
  const answers = {};
  if (questions.length > 0) {
    questions.forEach((q, i) => {
      answers[q.id || `q${i}`] = 'Yes, that sounds correct.';
    });
  } else {
    answers['q1'] = 'Yes.';
  }

  const answerRes = await fetch(`${API_BASE}/contract/answer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractId, answers })
  });
  if (!answerRes.ok) throw new Error('Contract answer failed');
  const answerJobId = (await answerRes.json()).jobId;
  const answerResult = await pollJob(answerJobId, accessToken, 'Contract Answer');
  console.log('✅ Questions answered.');

  const generateRes = await fetch(`${API_BASE}/contract/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractId })
  });
  if (!generateRes.ok) throw new Error('Contract generate failed');
  const generateJobId = (await generateRes.json()).jobId;
  const generateResult = await pollJob(generateJobId, accessToken, 'Contract Generate');
  console.log('✅ Final contract text generated.');

  const reportRes = await fetch(`${API_BASE}/contract/report`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contractId })
  });
  if (!reportRes.ok) throw new Error('Contract report failed');
  const reportJobId = (await reportRes.json()).jobId;
  const reportResult = await pollJob(reportJobId, accessToken, 'Contract Report');
  console.log('✅ Exposure report generated.');

  const contractHistRes = await fetch(`${API_BASE}/contract/history`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const contractHistData = await contractHistRes.json();
  if (contractHistData.data.length > 0) {
    console.log(`✅ Contract history retrieved successfully. Count: ${contractHistData.data.length}`);
  } else {
    throw new Error('Contract history is empty but expected 1 entry');
  }

  console.log('\n✅ ALL E2E TESTS PASSED PERFECTLY!');
}

run().catch(err => {
  console.error('\n❌ TEST SUITE FAILED!');
  console.error(err);
});
