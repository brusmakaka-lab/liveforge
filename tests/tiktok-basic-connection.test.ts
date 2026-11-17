import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommonMessageData,
  Gift,
  ProtoMessageFetchResult,
  RouteConfig,
  TikTokLiveConnection,
  User,
  WebcastChatMessage,
  WebcastEvent,
  WebcastGiftMessage,
  WebcastLikeMessage,
  WebcastMemberMessage,
  WebcastSocialMessage,
  WebcastSubNotifyMessage,
  type DecodedData,
  type WebSocketParams,
} from 'tiktok-live-connector';
import { TikTokNormalizer } from '../src/providers/tiktok-normalizer';
import type { EventType, InternalLiveEvent } from '../src/shared/model';

const empty = new Uint8Array();

// Keep the installed connector's connect/dispatch logic. Replace only the network
// boundary so this regression never needs a LIVE, credentials or an Euler plan.
class ConnectorProbe extends TikTokLiveConnection {
  readonly sockets: { url: string; params: WebSocketParams; roomId: string }[] = [];
  protected override async setupWebsocket(
    url: string,
    params: WebSocketParams,
    roomId: string,
  ): Promise<void> {
    this.sockets.push({ url, params, roomId });
  }
  async deliver(message: DecodedData): Promise<void> {
    await this.processDecodedData(message);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('installed TikTok connector without the optional gift catalog', () => {
  it('reads v3 chat content while keeping legacy comment/message compatibility', () => {
    const normalizer = new TikTokNormalizer();
    for (const packet of [
      { content: '!boss', comment: 'old text', message: 'old text' },
      { comment: '!boss' },
      { message: '!boss' },
    ])
      expect(normalizer.normalize('CHAT', packet).payload).toEqual({ message: '!boss' });
  });
  it('reaches the anonymous WebSocket handshake without gift-list or general URL-signing requests', async () => {
    const roomId = '123456789';
    vi.spyOn(RouteConfig, 'fetchRoomIdComposite').mockResolvedValue(roomId);
    vi.spyOn(RouteConfig, 'fetchRoomInfo').mockResolvedValue({ data: { status: 2 } });
    const catalog = vi
      .spyOn(RouteConfig, 'fetchRoomGifts')
      .mockRejectedValue(new Error('Unexpected catalog request'));
    const premiumSign = vi
      .spyOn(RouteConfig, 'fetchWebcastSignatureFromProvider')
      .mockRejectedValue(new Error('Unexpected Business signing request'));
    const normalHandshake = vi.spyOn(RouteConfig, 'fetchSignedWebSocketFromProvider').mockResolvedValue({
      fetchResult: {
        ...ProtoMessageFetchResult.decode(empty),
        cursor: 'current-cursor',
        internalExt: 'current-context',
        pushServer: 'wss://test.invalid/',
      },
      fetchResultCookieHeader: '',
    });
    const c = new ConnectorProbe('palermotusi', { processInitialData: false, enableExtendedGiftInfo: false });
    try {
      expect((await c.connect()).isConnected).toBe(true);
      expect(catalog).not.toHaveBeenCalled();
      expect(premiumSign).not.toHaveBeenCalled();
      expect(normalHandshake).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          roomId,
          authenticateWs: false,
          useMobile: false,
        }),
      );
      expect(c.sockets).toEqual([
        {
          url: 'wss://test.invalid/',
          roomId,
          params: {
            compress: 'gzip',
            room_id: roomId,
            cursor: 'current-cursor',
            internal_ext: 'current-context',
          },
        },
      ]);
      expect(c.availableGifts).toBeNull();
    } finally {
      await c.disconnect();
    }
  });

  it('decodes gifts and streak phases with ID, name and value directly from protobuf, without extendedGiftInfo', async () => {
    const c = new ConnectorProbe('palermotusi', { enableExtendedGiftInfo: false });
    const normalizer = new TikTokNormalizer();
    const events: InternalLiveEvent[] = [];
    c.on(WebcastEvent.GIFT, (data) => {
      expect(data.extendedGiftInfo).toBeUndefined();
      events.push(normalizer.normalize('GIFT', data));
    });
    for (const [repeatCount, repeatEnd] of [
      [1, 0],
      [5, 0],
      [5, 1],
    ] as const) {
      const encoded = WebcastGiftMessage.encode({
        ...WebcastGiftMessage.decode(empty),
        common: { ...CommonMessageData.decode(empty), msgId: String(repeatCount * 10 + repeatEnd) },
        user: { ...User.decode(empty), id: '123', displayId: 'testuser' },
        giftId: '5655',
        groupId: '777',
        repeatCount,
        repeatEnd,
        gift: { ...Gift.decode(empty), id: '5655', name: 'Rose', type: 1, diamondCount: 1 },
      }).finish();
      await c.deliver({ type: 'WebcastGiftMessage', data: WebcastGiftMessage.decode(encoded) });
    }
    expect(events.map((event) => event.payload)).toEqual(
      [1, 5, 5].map((repeatCount, index) => ({
        giftId: '5655',
        giftName: 'Rose',
        repeatCount,
        repeatEnd: index === 2,
        streak: true,
        streakId: '777',
        diamondCount: 1,
      })),
    );
    expect(new Set(events.map((event) => event.id)).size).toBe(3);
  });

  it('preserves like totals, follows, shares, chat, subscribe and member events without the catalog', async () => {
    const c = new ConnectorProbe('palermotusi', { enableExtendedGiftInfo: false });
    const normalizer = new TikTokNormalizer();
    const events: InternalLiveEvent[] = [];
    const bindings: [WebcastEvent, EventType][] = [
      [WebcastEvent.LIKE, 'LIKE'],
      [WebcastEvent.FOLLOW, 'FOLLOW'],
      [WebcastEvent.SHARE, 'SHARE'],
      [WebcastEvent.CHAT, 'CHAT'],
      [WebcastEvent.SUB_NOTIFY, 'SUBSCRIBE'],
      [WebcastEvent.MEMBER, 'MEMBER_JOIN'],
    ];
    for (const [external, internal] of bindings)
      c.on(external, (data: unknown) => {
        events.push(normalizer.normalize(internal, data));
      });
    const user = { ...User.decode(empty), id: '123', displayId: 'testuser' };
    await c.deliver({
      type: 'WebcastLikeMessage',
      data: { ...WebcastLikeMessage.decode(empty), user, count: 34, total: '50000' },
    });
    for (const kind of ['follow', 'share']) {
      const social = WebcastSocialMessage.decode(empty);
      await c.deliver({
        type: 'WebcastSocialMessage',
        data: {
          ...social,
          user,
          common: {
            ...CommonMessageData.decode(empty),
            displayText: { key: kind } as NonNullable<CommonMessageData['displayText']>,
          },
        },
      });
    }
    await c.deliver({
      type: 'WebcastChatMessage',
      data: { ...WebcastChatMessage.decode(empty), user, content: '!boss' },
    });
    await c.deliver({
      type: 'WebcastSubNotifyMessage',
      data: { ...WebcastSubNotifyMessage.decode(empty), user, subscribingStatus: 1 },
    });
    await c.deliver({ type: 'WebcastMemberMessage', data: { ...WebcastMemberMessage.decode(empty), user } });
    expect(events.map((event) => event.type)).toEqual([
      'LIKE',
      'FOLLOW',
      'SHARE',
      'CHAT',
      'SUBSCRIBE',
      'MEMBER_JOIN',
    ]);
    expect(events[0]!.payload).toEqual({ likeCount: 34, totalLikeCount: 50000 });
    expect(events[3]!.payload).toEqual({ message: '!boss' });
    expect(events.every((event) => event.user.id === '123')).toBe(true);
  });
});
