import type { Client, Group } from '@xmtp/browser-sdk';

import {
  APP_ID,
  ContentTypeExpense,
  ContentTypeMemberAdded,
  ContentTypeTripInit,
  expenseCodec,
  isExpenseContent,
  isTripInitContent,
  isValidExpense,
  isValidTripInit,
  memberAddedCodec,
  TRIP_NAME_PREFIX,
  tripInitCodec,
  type Expense,
  type MemberAdded,
  type TripInit,
} from './codecs';

export type TripSummary = {
  conversationId: string;
  tripId: string;
  name: string;
  currency: string;
  creator: string;
  members: string[];
  createdAt: number;
  // XMTP consent: 0=Unknown (pending invite), 1=Allowed, 2=Denied.
  consentState: number;
};

export const CONSENT_UNKNOWN = 0;
export const CONSENT_ALLOWED = 1;
export const CONSENT_DENIED = 2;

/**
 * Lists trip-init groups for the current client. Filters by:
 *  - XMTP group name prefix (cheap pre-filter)
 *  - First message matching ContentTypeTripInit
 *  - Sender = claimed creator, members = current XMTP roster
 */
export async function listTrips(client: Client): Promise<TripSummary[]> {
  await client.conversations.sync();
  // ConsentState: Unknown=0, Allowed=1. Include both so invitees see groups
  // they haven't explicitly accepted yet (otherwise unaccepted invites would
  // be filtered out and never surface). Caller splits by consentState.
  const groups = await client.conversations.listGroups({
    consentStates: [CONSENT_UNKNOWN, CONSENT_ALLOWED] as never,
  });
  const trips: TripSummary[] = [];
  for (const g of groups) {
    if (!g.name?.startsWith(TRIP_NAME_PREFIX)) continue;
    const summary = await loadTripSummary(g);
    if (summary) trips.push(summary);
  }
  trips.sort((a, b) => b.createdAt - a.createdAt);
  return trips;
}

export async function setTripConsent(
  client: Client,
  conversationId: string,
  state: number,
): Promise<void> {
  const g = (await client.conversations.getConversationById(conversationId)) as
    | Group
    | undefined;
  if (!g) return;
  await g.updateConsentState(state as never);
}

/**
 * Loads + validates the trip-init message from an XMTP group. Returns null
 * if the group doesn't carry a valid trip-init.
 */
export async function loadTripSummary(group: Group): Promise<TripSummary | null> {
  await group.sync();
  const consentState = await group.consentState();
  const msgs = await group.messages({ limit: 50n });
  // Oldest → newest. Trip-init is the canonical first matching message.
  const ordered = [...msgs].sort((a, b) => Number(a.sentAtNs - b.sentAtNs));
  const init = ordered.find((m) => isTripInitContent(m.contentType));
  if (!init) return null;

  const payload = init.content as TripInit;
  const memberAddrs = await groupMemberAddresses(group);
  const senderAddr = await senderInboxAddress(group, init.senderInboxId);
  if (!senderAddr) return null;
  if (!isValidTripInit(payload, senderAddr, memberAddrs)) return null;

  return {
    conversationId: group.id,
    tripId: payload.tripId,
    name: payload.name,
    currency: payload.currency,
    creator: payload.creator,
    members: payload.members,
    createdAt: payload.ts,
    consentState: consentState as unknown as number,
  };
}

export async function groupMemberAddresses(group: Group): Promise<string[]> {
  const members = await group.members();
  const addrs: string[] = [];
  for (const m of members) {
    const eth = m.accountIdentifiers.find((id) => id.identifierKind === 0);
    if (eth) addrs.push(eth.identifier.toLowerCase());
  }
  return addrs;
}

async function senderInboxAddress(
  group: Group,
  inboxId: string,
): Promise<string | null> {
  const members = await group.members();
  const sender = members.find((m) => m.inboxId === inboxId);
  const eth = sender?.accountIdentifiers.find((id) => id.identifierKind === 0);
  return eth?.identifier.toLowerCase() ?? null;
}

/**
 * Creates a new trip-bearing XMTP group with the given members and posts
 * the canonical trip-init message.
 */
export async function createTrip(
  client: Client,
  args: { name: string; currency: string; members: string[]; creator: string },
): Promise<TripSummary> {
  const tripId = crypto.randomUUID();
  const allMembers = uniqueLowercase([args.creator, ...args.members]);
  const inviteeIdentifiers = args.members.map((m) => ({
    identifier: m.toLowerCase(),
    identifierKind: 0 as const,
  }));

  const group = await client.conversations.createGroupWithIdentifiers(
    inviteeIdentifiers,
    {
      groupName: `${TRIP_NAME_PREFIX}${args.name}`,
      groupDescription: `Vacation expense split. Trip id ${tripId}.`,
    },
  );

  const payload: TripInit = {
    kind: 'trip-init',
    appId: APP_ID,
    tripId,
    creator: args.creator.toLowerCase(),
    members: allMembers,
    name: args.name,
    currency: args.currency,
    ts: Math.floor(Date.now() / 1000),
  };
  await group.send(tripInitCodec.encode(payload));

  // Creator's own group is auto-allowed.
  await group.updateConsentState(CONSENT_ALLOWED as never);

  return {
    conversationId: group.id,
    tripId,
    name: args.name,
    currency: args.currency,
    creator: args.creator.toLowerCase(),
    members: allMembers,
    createdAt: payload.ts,
    consentState: CONSENT_ALLOWED,
  };
}

export async function postExpense(
  group: Group,
  args: { tripId: string; payer: string; amount: string; currency: string; label: string },
): Promise<void> {
  const payload: Expense = {
    kind: 'expense',
    tripId: args.tripId,
    payer: args.payer.toLowerCase(),
    amount: args.amount,
    currency: args.currency,
    label: args.label,
    ts: Math.floor(Date.now() / 1000),
  };
  await group.send(expenseCodec.encode(payload));
}

export async function addTripMember(
  group: Group,
  args: { tripId: string; member: string },
): Promise<void> {
  await group.addMembersByIdentifiers([
    { identifier: args.member.toLowerCase(), identifierKind: 0 as const },
  ]);
  const payload: MemberAdded = {
    kind: 'member-added',
    tripId: args.tripId,
    member: args.member.toLowerCase(),
    ts: Math.floor(Date.now() / 1000),
  };
  await group.send(memberAddedCodec.encode(payload));
}

export type TripMessage =
  | { kind: 'text'; id: string; ts: number; sender: string; text: string }
  | { kind: 'expense'; id: string; ts: number; sender: string; payload: Expense }
  | { kind: 'member-added'; id: string; ts: number; sender: string; payload: MemberAdded }
  | { kind: 'unknown'; id: string; ts: number; sender: string }; // includes trip-init

export async function fetchTripMessages(
  group: Group,
  tripId: string,
): Promise<TripMessage[]> {
  await group.sync();
  const raw = await group.messages({ limit: 200n });
  const ordered = [...raw].sort((a, b) => Number(a.sentAtNs - b.sentAtNs));
  const memberMap = await senderAddressMap(group);

  const out: TripMessage[] = [];
  for (const m of ordered) {
    const sender = memberMap.get(m.senderInboxId) ?? '0x';
    const ts = Number(m.sentAtNs / 1_000_000_000n);
    const id = m.id ?? `${m.senderInboxId}:${m.sentAtNs.toString()}`;

    // Trip-init shows up but we filter it out of the visible feed.
    if (isTripInitContent(m.contentType)) continue;

    if (isExpenseContent(m.contentType)) {
      const payload = m.content as Expense;
      if (!isValidExpense(payload, sender, tripId)) continue;
      out.push({ kind: 'expense', id, ts, sender, payload });
      continue;
    }
    if (m.contentType.authorityId === ContentTypeMemberAdded.authorityId &&
        m.contentType.typeId === ContentTypeMemberAdded.typeId) {
      const payload = m.content as MemberAdded;
      if (payload.tripId !== tripId) continue;
      out.push({ kind: 'member-added', id, ts, sender, payload });
      continue;
    }
    if (typeof m.content === 'string') {
      out.push({ kind: 'text', id, ts, sender, text: m.content });
      continue;
    }
    out.push({ kind: 'unknown', id, ts, sender });
  }
  return out;
}

async function senderAddressMap(group: Group): Promise<Map<string, string>> {
  const members = await group.members();
  const map = new Map<string, string>();
  for (const m of members) {
    const eth = m.accountIdentifiers.find((id) => id.identifierKind === 0);
    if (eth) map.set(m.inboxId, eth.identifier.toLowerCase());
  }
  return map;
}

function uniqueLowercase(addrs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of addrs) {
    const l = a.toLowerCase();
    if (!seen.has(l)) {
      seen.add(l);
      out.push(l);
    }
  }
  return out;
}

// Re-export for callers.
export { ContentTypeExpense, ContentTypeTripInit };
