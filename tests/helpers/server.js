// Spin up the real Express app on an ephemeral port for integration tests.
// Returns a base URL the test can hit with globalThis.fetch.
import http from 'node:http';
import { createApp } from '../../src/app.js';

export async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const close = () => new Promise((r) => server.close(r));
  return { baseUrl, close };
}

// Build a multipart/form-data body for file upload without a helper dep.
// Returns { body: Buffer, contentType: string }.
export function buildMultipartFile(fieldName, filename, fileBuffer, mimetype = 'application/pdf') {
  const boundary = '----kontrakt-test-' + Math.random().toString(16).slice(2);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`));
  parts.push(Buffer.from(`Content-Type: ${mimetype}\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}
