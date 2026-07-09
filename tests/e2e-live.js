import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const BASE_URL = 'https://kontrakt.fly.dev/api';
const WS_URL = 'wss://kontrakt.fly.dev/ws';

let accessToken = '';
let cookieHeader = '';

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { ...options.headers };

  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }

  // Auto-set Content-Type for JSON
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  console.log(`\n[HTTP] -> ${options.method || 'GET'} ${url}`);
  const res = await fetch(url, { ...options, headers });
  
  // Save set-cookie
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookieHeader = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  
  if (!res.ok) {
    console.error(`[HTTP] <- ${res.status} Error:`, data);
    throw new Error(`Request failed with status ${res.status}`);
  }
  
  console.log(`[HTTP] <- ${res.status} OK`);
  return data;
}

function waitForJobViaWs(jobId) {
  return new Promise((resolve, reject) => {
    console.log(`[WS] Connecting to ${WS_URL}...`);
    const ws = new WebSocket(WS_URL, {
      headers: { Cookie: cookieHeader }
    });

    ws.on('open', () => {
      console.log(`[WS] Connected. Subscribing to job ${jobId}`);
      ws.send(JSON.stringify({ type: 'subscribe', jobId }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'job:status') {
        console.log(`[WS] Job Status: ${msg.status}`);
      } else if (msg.type === 'job:complete') {
        console.log(`[WS] Job Complete!`);
        ws.close();
        resolve(msg.result);
      } else if (msg.type === 'job:failed') {
        console.error(`[WS] Job Failed:`, msg.error);
        ws.close();
        reject(msg.error);
      } else if (msg.type === 'error') {
        console.error(`[WS] Error:`, msg.message);
        ws.close();
        reject(msg.message);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Connection Error:`, err);
      reject(err);
    });
  });
}

async function runTest() {
  try {
    console.log('\n--- 1. Testing Health ---');
    await request('/health?deep=1');

    console.log('\n--- 2. Testing Auth ---');
    const randomSuffix = Math.floor(Math.random() * 100000);
    const email = `testuser${randomSuffix}@example.com`;
    
    console.log(`Registering user ${email}...`);
    await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User', email, password: 'password123' })
    });

    console.log(`Fetching /me...`);
    const meRes = await request('/auth/me');
    console.log(`Logged in as:`, meRes.data.email);

    console.log('\n--- 3. Testing Contract Interrogator ---');
    console.log(`Starting contract...`);
    const startRes = await request('/contract/start', {
      method: 'POST',
      body: JSON.stringify({ gigDescription: 'I want to build a simple mobile app for $5000' })
    });
    
    console.log(`Waiting for start job...`);
    const startData = await waitForJobViaWs(startRes.jobId);
    console.log(`Contract initialized. ID:`, startData.contractId);
    
    const contractId = startData.contractId;
    
    console.log(`Answering questions...`);
    const answerRes = await request('/contract/answer', {
      method: 'POST',
      body: JSON.stringify({
        contractId,
        answers: { "totalFee": "5000", "netDays": "30" }
      })
    });
    await waitForJobViaWs(answerRes.jobId);
    
    console.log(`Generating contract...`);
    const genRes = await request('/contract/generate', {
      method: 'POST',
      body: JSON.stringify({ contractId })
    });
    await waitForJobViaWs(genRes.jobId);

    console.log(`Generating exposure report...`);
    const repRes = await request('/contract/report', {
      method: 'POST',
      body: JSON.stringify({ contractId })
    });
    await waitForJobViaWs(repRes.jobId);

    console.log(`Fetching contract to verify exposure report type...`);
    const contractRes = await request(`/contract/${contractId}`);
    console.log(`Exposure Report Type:`, typeof contractRes.data.exposureReport);
    if (typeof contractRes.data.exposureReport === 'object') {
      console.log(`Exposure Report Structure:`, Object.keys(contractRes.data.exposureReport));
    }

    console.log('\n--- 4. Testing Audit Flow ---');
    const pdfPath = '/Users/francium/Desktop/software-development-agreement-contract-template-word.pdf';
    console.log(`Uploading PDF: ${pdfPath}`);
    
    const fileBuffer = fs.readFileSync(pdfPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('contractFile', blob, 'contract.pdf');

    const extractRes = await request('/audit/extract', {
      method: 'POST',
      body: formData
    });
    
    console.log(`Waiting for extraction job...`);
    const extractData = await waitForJobViaWs(extractRes.jobId);
    
    console.log(`Extracted text length: ${extractData.text?.length} chars`);
    
    if (extractData.text && extractData.extractToken) {
      console.log(`Submitting text for deep analysis...`);
      const analyzeRes = await request('/audit/analyze', {
        method: 'POST',
        headers: {
          'x-extract-token': extractData.extractToken
        },
        body: JSON.stringify({ contractText: extractData.text })
      });
      
      console.log(`Waiting for analysis job...`);
      const analyzeData = await waitForJobViaWs(analyzeRes.jobId);
      console.log(`Analysis complete! Found ${analyzeData.flags?.length || 0} flags.`);
    }

    console.log('\n--- Test Suite Complete! ---');
  } catch (err) {
    console.error('\n--- TEST SUITE FAILED ---');
    console.error(err);
  }
}

runTest();
