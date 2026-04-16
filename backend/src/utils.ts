import crypto from 'node:crypto';
import path from 'node:path';

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

export function asciiSafeFileName(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]+/g, ' ');

  const extension = path.extname(normalized);
  const baseName = extension ? normalized.slice(0, -extension.length) : normalized;
  const safeBaseName = safeFileName(baseName) || 'download';
  const safeExtension = safeFileName(extension.replace(/^\./, ''));

  return safeExtension ? `${safeBaseName}.${safeExtension}` : safeBaseName;
}

export function createAttachmentDisposition(fileName: string) {
  const asciiFileName = asciiSafeFileName(fileName);
  const encodedFileName = encodeURIComponent(fileName)
    .replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

  return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`;
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

export function toUtf8Text(input: Buffer) {
  return stripByteOrderMark(input.toString('utf-8'));
}

export function detectArtifactPreviewKind(contentType: string, fileName: string) {
  const normalizedContentType = contentType.toLowerCase();
  const extension = path.extname(fileName).toLowerCase();

  if (normalizedContentType.includes('application/json') || extension === '.json') {
    return 'json' as const;
  }
  if (normalizedContentType.includes('text/markdown') || extension === '.md' || extension === '.markdown') {
    return 'markdown' as const;
  }
  if (normalizedContentType.startsWith('text/')) {
    return 'text' as const;
  }
  return 'unsupported' as const;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function toMarkdownHeading(level: number, text: string) {
  return `${'#'.repeat(level)} ${text}`;
}
