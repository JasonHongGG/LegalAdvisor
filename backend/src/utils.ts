import crypto from 'node:crypto';

export function createId() {
  return crypto.randomUUID();
}

export function isoNow() {
  return new Date().toISOString();
}

export function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function sha256(input: Buffer | string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function toMarkdownHeading(level: number, text: string) {
  return `${'#'.repeat(level)} ${text}`;
}
