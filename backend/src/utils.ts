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

export function stripByteOrderMark(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function parseJsonText<T>(value: string) {
  return JSON.parse(stripByteOrderMark(value)) as T;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function toMarkdownHeading(level: number, text: string) {
  return `${'#'.repeat(level)} ${text}`;
}
