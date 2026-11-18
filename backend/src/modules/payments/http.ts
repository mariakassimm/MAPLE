import http from 'http';
import https from 'https';
import type { HttpClient } from './types';

const MAX_RESPONSE_BYTES = 2_000_000;

// Provider calls get a hard timeout, a response size cap, and never follow redirects, so a slow or hostile
// endpoint cannot hang a request, exhaust memory, or bounce us to an internal address.
// node:https is used (not fetch) because some courier APIs document GET requests that carry a JSON body.
export const defaultHttp: HttpClient = (url, request) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const headers: Record<string, string> = { ...request.headers };
    if (request.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(request.body));
    const req = lib.request(
      target,
      { method: request.method, headers, timeout: request.timeoutMs ?? 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) req.destroy(new Error('response too large'));
          else chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (request.body !== undefined) req.write(request.body);
    req.end();
  });
