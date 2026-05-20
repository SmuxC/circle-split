import {
  ContentTypeId,
  type ContentCodec,
  type EncodedContent,
} from '@xmtp/content-type-primitives';

// Authority namespaces this app's codecs. Pick something unique to you in
// production; collisions across apps would let an unrelated XMTP message
// surface in this miniapp's trip list.
const AUTHORITY = 'embedded-miniapp-boilerplate';
export const APP_ID = `${AUTHORITY}@1.0`;

// Sentinel embedded in group name. Combined with codec validation, lets us
// cheaply pre-filter `conversations.list()` before opening each group's
// messages to verify the trip-init payload.
export const TRIP_NAME_PREFIX = 'vsplit:';

export const ContentTypeTripInit: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'trip-init',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypeExpense: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'expense',
  versionMajor: 1,
  versionMinor: 0,
};

export const ContentTypeMemberAdded: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'member-added',
  versionMajor: 1,
  versionMinor: 0,
};

export interface TripInit {
  kind: 'trip-init';
  appId: string;
  tripId: string;
  creator: string;
  members: string[];
  name: string;
  currency: string;
  ts: number;
}

export interface Expense {
  kind: 'expense';
  tripId: string;
  payer: string;
  amount: string;
  currency: string;
  label: string;
  ts: number;
}

export interface MemberAdded {
  kind: 'member-added';
  tripId: string;
  member: string;
  ts: number;
}

function eq(a: ContentTypeId, b: ContentTypeId): boolean {
  return a.authorityId === b.authorityId && a.typeId === b.typeId;
}

export function isTripInitContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypeTripInit);
}

export function isExpenseContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypeExpense);
}

export function isMemberAddedContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypeMemberAdded);
}

function jsonCodec<T>(contentType: ContentTypeId): ContentCodec<T> {
  return {
    contentType,
    encode(content: T): EncodedContent {
      return {
        type: contentType,
        parameters: {},
        content: new TextEncoder().encode(JSON.stringify(content)),
      };
    },
    decode(encoded: EncodedContent): T {
      return JSON.parse(new TextDecoder().decode(encoded.content)) as T;
    },
    fallback(content: T): string | undefined {
      const c = content as { kind?: string };
      return `[${c.kind ?? contentType.typeId}]`;
    },
    shouldPush: () => true,
  };
}

export const tripInitCodec: ContentCodec<TripInit> = jsonCodec<TripInit>(ContentTypeTripInit);
export const expenseCodec: ContentCodec<Expense> = jsonCodec<Expense>(ContentTypeExpense);
export const memberAddedCodec: ContentCodec<MemberAdded> = jsonCodec<MemberAdded>(
  ContentTypeMemberAdded,
);

export const ALL_CODECS = [tripInitCodec, expenseCodec, memberAddedCodec];

/**
 * Validates a trip-init payload against the XMTP message sender + group
 * membership. Returns true only if the message can be trusted as the trip's
 * canonical initialization message.
 */
export function isValidTripInit(
  payload: TripInit,
  senderAddress: string,
  groupMemberAddresses: string[],
): boolean {
  if (payload.kind !== 'trip-init') return false;
  if (payload.appId !== APP_ID) return false;
  if (payload.creator.toLowerCase() !== senderAddress.toLowerCase()) return false;
  const memberSet = new Set(payload.members.map((m) => m.toLowerCase()));
  if (!memberSet.has(payload.creator.toLowerCase())) return false;
  // Every claimed member must currently be in the XMTP group.
  const groupSet = new Set(groupMemberAddresses.map((m) => m.toLowerCase()));
  for (const m of memberSet) {
    if (!groupSet.has(m)) return false;
  }
  return true;
}

/**
 * Validates an expense payload against sender + trip context.
 */
export function isValidExpense(
  payload: Expense,
  senderAddress: string,
  tripId: string,
): boolean {
  if (payload.kind !== 'expense') return false;
  if (payload.tripId !== tripId) return false;
  if (payload.payer.toLowerCase() !== senderAddress.toLowerCase()) return false;
  if (!payload.amount || isNaN(Number(payload.amount)) || Number(payload.amount) <= 0)
    return false;
  return true;
}
