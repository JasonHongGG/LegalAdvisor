import { describe, expect, it } from 'vitest';
import { getErrorMessage, toErrorResponsePayload } from './errors.js';

describe('error translation', () => {
  it('translates the ON CONFLICT unique constraint mismatch into a domain-level message', () => {
    const error = Object.assign(new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification'), {
      code: '42P10',
    });

    expect(getErrorMessage(error)).toBe('法規資料寫入失敗，系統資料表唯一鍵設定不一致。');
    expect(toErrorResponsePayload(error)).toMatchObject({
      code: 'internal_error',
      message: '法規資料寫入失敗，系統資料表唯一鍵設定不一致。',
    });
  });
});