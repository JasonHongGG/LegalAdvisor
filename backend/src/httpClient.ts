import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  insecureTls?: boolean;
  maxRedirects?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  buffer: Buffer;
  text(): string;
  json<T>(): T;
}

function decompressBuffer(buffer: Buffer, encoding: string | undefined) {
  if (!encoding) {
    return buffer;
  }

  const normalized = encoding.toLowerCase();
  if (normalized.includes('gzip')) {
    return zlib.gunzipSync(buffer);
  }
  if (normalized.includes('deflate')) {
    return zlib.inflateSync(buffer);
  }
  if (normalized.includes('br')) {
    return zlib.brotliDecompressSync(buffer);
  }
  return buffer;
}

function makeRequest(urlString: string, options: HttpRequestOptions = {}, redirectCount = 0): Promise<HttpResponse> {
  const maxRedirects = options.maxRedirects ?? 5;
  const url = new URL(urlString);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip, deflate, br',
          'user-agent': 'LegalAdvisorBot/1.0 (+https://github.com/) ',
          ...options.headers,
        },
        rejectUnauthorized: !(options.insecureTls ?? false),
      },
      (response) => {
        const status = response.statusCode ?? 500;
        const location = response.headers.location;
        if (location && [301, 302, 303, 307, 308].includes(status)) {
          response.resume();
          if (redirectCount >= maxRedirects) {
            reject(new Error(`Too many redirects while fetching ${urlString}`));
            return;
          }
          const nextUrl = new URL(location, urlString).toString();
          makeRequest(nextUrl, options, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          try {
            const rawBuffer = Buffer.concat(chunks);
            const buffer = decompressBuffer(rawBuffer, response.headers['content-encoding']);
            const headers = Object.fromEntries(
              Object.entries(response.headers)
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
                .map(([key, value]) => [key.toLowerCase(), value]),
            );
            resolve({
              status,
              headers,
              buffer,
              text() {
                return buffer.toString('utf-8');
              },
              json<T>() {
                return JSON.parse(buffer.toString('utf-8')) as T;
              },
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
    request.end();
  });
}

export const httpClient = {
  get: makeRequest,
};
