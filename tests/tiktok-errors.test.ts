import { describe, expect, it } from 'vitest';
import { InvalidResponseCompositeError, InvalidResponseError } from 'tiktok-live-connector';
import { tiktokErrorDetails, tiktokErrorMessage } from '../src/providers/tiktok-errors';
import { Logger } from '../src/core/logging';

describe('TikTok diagnostic boundary', () => {
  it('retains the installed connector composite errors, routes, stacks and causes', () => {
    const exception = new InvalidResponseCompositeError(
      {
        routeId: 'fetchRoomIdRoute',
        requestErrs: [
          new InvalidResponseError({ routeId: 'fetchRoomInfoHtmlRoute' }, 'Missing SIGI_STATE'),
          new InvalidResponseError(
            { routeId: 'fetchRoomInfoApiLiveRoute' },
            'API Error 19881007 (user_not_found)',
          ),
          new Error('network failed', {
            cause: Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
          }),
        ],
      },
      'Failed to retrieve Room ID from all sources',
    );
    const error = { info: 'Error while connecting', exception };
    expect(tiktokErrorDetails(error)).toMatchObject({
      exception: {
        message: exception.message,
        stack: expect.any(String),
        config: {
          routeId: 'fetchRoomIdRoute',
          requestErrs: [
            { message: expect.stringContaining('SIGI_STATE'), stack: expect.any(String) },
            { message: expect.stringContaining('user_not_found') },
            { cause: { message: 'connection refused', code: 'ECONNREFUSED' } },
          ],
        },
      },
    });
    expect(tiktokErrorMessage(error)).toContain('user_not_found');
    expect(tiktokErrorMessage(error)).toContain('connection refused');
  });

  it('keeps HTTP status but excludes headers, credentials and signed query strings', () => {
    const error = Object.assign(new Error('Request https://user:pass@example.com/room?token=abc failed'), {
      config: { url: 'https://example.com', headers: { Authorization: 'private' }, password: 'secret' },
      response: {
        status: 403,
        data: { message: 'Denied', token: 'private' },
        headers: { 'set-cookie': 'private' },
      },
    });
    const serialized = JSON.stringify(tiktokErrorDetails(error));
    expect(serialized).not.toMatch(/user:pass|token=abc|private|secret|Authorization/);
    expect(serialized).toContain('https://example.com/room?[REDACTED]');
    expect(tiktokErrorDetails(error)).toMatchObject({
      response: { status: 403, data: { message: 'Denied' } },
    });
    const log = new Logger();
    log.protect('known-key');
    log.write('ERROR', 'LIVE', tiktokErrorMessage(new Error('known-key')), {
      error: tiktokErrorDetails(new Error('known-key')),
    });
    expect(JSON.stringify(log.entries)).not.toContain('known-key');
  });

  it('bounds cycles/large errors, handles primitives and unreadable properties without throwing', () => {
    const cyclic: Record<string, unknown> = { message: 'failure' };
    cyclic.cause = cyclic;
    Object.defineProperty(cyclic, 'response', {
      get() {
        throw new Error('cannot read');
      },
    });
    expect(tiktokErrorDetails(cyclic)).toEqual({
      message: 'failure',
      cause: '[circular]',
      response: '[unreadable field]',
    });
    expect(tiktokErrorMessage('plain error')).toBe('plain error');
    expect(tiktokErrorMessage(undefined)).toBe('undefined');
    expect(tiktokErrorMessage({})).not.toContain('[object Object]');
    const many = { errors: Array.from({ length: 500 }, () => new Error('x'.repeat(20_000))) };
    expect(JSON.stringify(tiktokErrorDetails(many)).length).toBeLessThan(200_000);
    expect(tiktokErrorMessage(many).length).toBeLessThanOrEqual(3000);
  });
});
