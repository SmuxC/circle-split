import { create } from 'zustand';

// Minimal shapes from XMTP v7 SDK
export type Member = {
  inboxId: string;
  accountIdentifiers: { identifier: string; identifierKind: number }[];
};

// Generic conversation shape — works for both Dm and Group
export type ConversationLike = {
  id: string;
  isDm: boolean;
  name?: string;
  createdAtNs: bigint;
  members(): Promise<Member[]>;
  peerInboxId(): Promise<string>;
  lastMessage(): Promise<RawMessage | undefined>;
};

export type RawMessage = {
  id: string;
  conversationId: string;
  sentAtNs: bigint;
  senderInboxId: string;
  content: unknown;
  contentType?: unknown;
  fallback?: string;
};

export type ConvoMetadata = {
  // Peer address (lowercase) for DMs; group name for groups.
  name: string;
  peerInboxId?: string;
  identifier?: string;
};

type InboxState = {
  conversations: Map<string, ConversationLike>;
  lastMessages: Map<string, RawMessage | undefined>;
  lastSentAt: Map<string, bigint>;
  members: Map<string, Map<string, Member>>;
  messages: Map<string, Map<string, RawMessage>>;
  metadata: Map<string, ConvoMetadata>;
  sortedConversations: ConversationLike[];
  sortedMessages: Map<string, RawMessage[]>;
  lastCreatedAt: bigint | undefined;
  lastSyncedAt: bigint | undefined;

  addConversation: (conversation: ConversationLike) => Promise<void>;
  addConversations: (conversations: ConversationLike[]) => Promise<void>;
  addMessage: (conversationId: string, message: RawMessage) => Promise<void>;
  addMessages: (conversationId: string, messages: RawMessage[]) => Promise<void>;
  getConversation: (id: string) => ConversationLike | undefined;
  hasConversation: (id: string) => boolean;
  setLastSyncedAt: (ts: bigint) => void;
  reset: () => void;
};

function sortConvos(
  convos: Map<string, ConversationLike>,
  lastMsgs: Map<string, RawMessage | undefined>,
): ConversationLike[] {
  return [...convos.values()].sort((a, b) => {
    const ta = lastMsgs.get(a.id)?.sentAtNs ?? a.createdAtNs ?? 0n;
    const tb = lastMsgs.get(b.id)?.sentAtNs ?? b.createdAtNs ?? 0n;
    return tb > ta ? 1 : tb < ta ? -1 : 0;
  });
}

function sortMsgs(msgs: Map<string, RawMessage>): RawMessage[] {
  return [...msgs.values()].sort((a, b) =>
    a.sentAtNs > b.sentAtNs ? 1 : a.sentAtNs < b.sentAtNs ? -1 : 0,
  );
}

function newerCreatedAt(
  conv: ConversationLike,
  current: bigint | undefined,
): bigint {
  if (!current) return conv.createdAtNs;
  return conv.createdAtNs > current ? conv.createdAtNs : current;
}

function isNewerMsg(msg: RawMessage, currentNs: bigint | undefined): boolean {
  if (!currentNs) return true;
  return msg.sentAtNs > currentNs;
}

async function buildMetadata(
  conversation: ConversationLike,
): Promise<ConvoMetadata> {
  const members = await conversation.members();
  const isDmLike = conversation.isDm || members.length === 2;
  if (!isDmLike) {
    return { name: conversation.name || 'Group' };
  }
  const peerInboxId = await conversation.peerInboxId().catch(() => null);
  const peer = peerInboxId ? members.find((m) => m.inboxId === peerInboxId) : null;
  if (peer) {
    const eth = peer.accountIdentifiers?.[0]?.identifier;
    if (eth) {
      return {
        name: eth.toLowerCase(),
        peerInboxId: peerInboxId ?? peer.inboxId,
        identifier: eth.toLowerCase(),
      };
    }
    return { name: peerInboxId ?? peer.inboxId, peerInboxId: peerInboxId ?? peer.inboxId };
  }
  return { name: conversation.name || 'Group' };
}

export const useInboxStore = create<InboxState>((set, get) => ({
  conversations: new Map(),
  lastMessages: new Map(),
  lastSentAt: new Map(),
  members: new Map(),
  messages: new Map(),
  metadata: new Map(),
  sortedConversations: [],
  sortedMessages: new Map(),
  lastCreatedAt: undefined,
  lastSyncedAt: undefined,

  addConversation: async (conversation) => {
    const state = get();
    const newConvos = new Map(state.conversations);
    newConvos.set(conversation.id, conversation);

    const members = await conversation.members();
    const newMembers = new Map(state.members);
    newMembers.set(conversation.id, new Map(members.map((m) => [m.inboxId, m])));

    const meta = await buildMetadata(conversation);
    const newMeta = new Map(state.metadata);
    newMeta.set(conversation.id, meta);

    const lastMsg = await conversation.lastMessage();
    const newLastMsgs = new Map(state.lastMessages);
    newLastMsgs.set(conversation.id, lastMsg);

    set({
      conversations: newConvos,
      lastCreatedAt: newerCreatedAt(conversation, state.lastCreatedAt),
      lastMessages: newLastMsgs,
      members: newMembers,
      metadata: newMeta,
      sortedConversations: sortConvos(newConvos, newLastMsgs),
    });
  },

  addConversations: async (conversations) => {
    if (conversations.length === 0) return;
    const state = get();

    const [allMembers, allLastMsgs, allMeta, allPeerIds] = await Promise.all([
      Promise.all(conversations.map(async (c) => [c.id, await c.members()] as const)),
      Promise.all(conversations.map(async (c) => [c.id, await c.lastMessage()] as const)),
      Promise.all(conversations.map(async (c) => [c.id, await buildMetadata(c)] as const)),
      Promise.all(
        conversations
          .filter((c) => c.isDm || (c as unknown as { members?: unknown }).members !== undefined)
          .map(async (c) => {
            const ms = await c.members().catch(() => [] as Member[]);
            if (c.isDm || ms.length === 2) {
              return [c.id, await c.peerInboxId().catch(() => null)] as const;
            }
            return [c.id, null] as const;
          }),
      ),
    ]);

    const membersMap = new Map(allMembers);
    const lastMsgsMap = new Map(allLastMsgs);
    const metaMap = new Map(allMeta);
    const peerMap = new Map(allPeerIds);

    const newConvos = new Map(state.conversations);
    const newMembers = new Map(state.members);
    const newMeta = new Map(state.metadata);
    const newLastMsgs = new Map(state.lastMessages);
    let lastCreatedAt = state.lastCreatedAt;

    for (const c of conversations) {
      newConvos.set(c.id, c);
      lastCreatedAt = newerCreatedAt(c, lastCreatedAt);
      const ms = membersMap.get(c.id) ?? [];
      newMembers.set(c.id, new Map(ms.map((m) => [m.inboxId, m])));
      newMeta.set(c.id, metaMap.get(c.id) ?? { name: c.name || 'Group' });
      newLastMsgs.set(c.id, lastMsgsMap.get(c.id));
    }

    // Suppress unused variable warning for peerMap (populated for side effect of prefetching)
    void peerMap;

    set({
      conversations: newConvos,
      lastCreatedAt,
      lastMessages: newLastMsgs,
      members: newMembers,
      metadata: newMeta,
      sortedConversations: sortConvos(newConvos, newLastMsgs),
    });
  },

  addMessage: async (conversationId, message) => {
    const state = get();
    const convMsgs = new Map(state.messages.get(conversationId) ?? new Map());
    convMsgs.set(message.id, message);
    const newMsgs = new Map(state.messages);
    newMsgs.set(conversationId, convMsgs);

    const newLastSentAt = new Map(state.lastSentAt);
    const newLastMsgs = new Map(state.lastMessages);
    if (isNewerMsg(message, state.lastSentAt.get(conversationId))) {
      newLastSentAt.set(conversationId, message.sentAtNs);
      newLastMsgs.set(conversationId, message);
    }

    const newSortedMsgs = new Map(state.sortedMessages);
    newSortedMsgs.set(conversationId, sortMsgs(convMsgs));

    set({
      lastMessages: newLastMsgs,
      lastSentAt: newLastSentAt,
      messages: newMsgs,
      sortedConversations: sortConvos(state.conversations, newLastMsgs),
      sortedMessages: newSortedMsgs,
    });
  },

  addMessages: async (conversationId, messages) => {
    const state = get();
    const convMsgs = new Map(state.messages.get(conversationId) ?? new Map());
    let lastSentAt = state.lastSentAt.get(conversationId);
    let lastMsg = state.lastMessages.get(conversationId);
    for (const m of messages) {
      convMsgs.set(m.id, m);
      if (isNewerMsg(m, lastSentAt)) {
        lastSentAt = m.sentAtNs;
        lastMsg = m;
      }
    }
    const newMsgs = new Map(state.messages);
    newMsgs.set(conversationId, convMsgs);
    const newLastSentAt = new Map(state.lastSentAt);
    newLastSentAt.set(conversationId, lastSentAt as bigint);
    const newLastMsgs = new Map(state.lastMessages);
    newLastMsgs.set(conversationId, lastMsg);
    const newSortedMsgs = new Map(state.sortedMessages);
    newSortedMsgs.set(conversationId, sortMsgs(convMsgs));

    set({
      lastMessages: newLastMsgs,
      lastSentAt: newLastSentAt,
      messages: newMsgs,
      sortedConversations: sortConvos(state.conversations, newLastMsgs),
      sortedMessages: newSortedMsgs,
    });
  },

  getConversation: (id) => get().conversations.get(id),
  hasConversation: (id) => get().conversations.has(id),
  setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),

  reset: () =>
    set({
      conversations: new Map(),
      lastMessages: new Map(),
      lastSentAt: new Map(),
      members: new Map(),
      messages: new Map(),
      metadata: new Map(),
      sortedConversations: [],
      sortedMessages: new Map(),
      lastCreatedAt: undefined,
      lastSyncedAt: undefined,
    }),
}));
