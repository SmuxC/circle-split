'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { Client } from '@xmtp/browser-sdk';

import { useWallet } from '@/hooks/use-wallet';
import { useInboxStore } from '@/lib/xmtp/store';

type Status = 'idle' | 'connecting' | 'ready' | 'error';

type XmtpContextValue = {
  client: Client | null;
  status: Status;
  error: string | null;
  tick: number;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const XmtpContext = createContext<XmtpContextValue>({
  client: null,
  status: 'idle',
  error: null,
  tick: 0,
  connect: async () => {},
  disconnect: () => {},
});

export function XmtpProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useWallet();
  const [client, setClient] = useState<Client | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const ownedBy = useRef<string | null>(null);

  const { addConversations, addConversation, addMessage, reset } = useInboxStore();

  const disconnect = useCallback(() => {
    setClient(null);
    setStatus('idle');
    setError(null);
    ownedBy.current = null;
    reset();
  }, [reset]);

  const connect = useCallback(async () => {
    if (!address || !isConnected) {
      setError('Wallet not connected.');
      return;
    }
    setStatus('connecting');
    setError(null);
    try {
      // Storage Access API: iOS Safari partitions iframe storage by default.
      try {
        if (
          typeof document !== 'undefined' &&
          'requestStorageAccess' in document &&
          window.top !== window.self
        ) {
          await (document as Document & { requestStorageAccess: () => Promise<void> })
            .requestStorageAccess();
        }
      } catch {}

      const { Client, LogLevel } = await import('@xmtp/browser-sdk');
      const { buildXmtpSigner } = await import('@/lib/xmtp/signer');
      const { ALL_CODECS } = await import('@/lib/xmtp/codecs');

      const signer = await buildXmtpSigner(address);
      const me = address.toLowerCase();

      // Read persisted xmtp-env from localStorage (defaults to 'production').
      const xmtpEnv =
        (typeof window !== 'undefined' && window.localStorage.getItem('xmtp-env')) ||
        'production';

      const c = await Client.create(signer, {
        env: xmtpEnv as 'production' | 'dev',
        dbEncryptionKey: undefined,
        appVersion: 'circles-miniapp/1',
        codecs: ALL_CODECS,
        loggingLevel: LogLevel.Off,
      } as unknown as Parameters<typeof Client.create>[1]);

      // Persist inbox ID for diagnostics / recovery check.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`xmtp-inbox-${me}`, (c as unknown as { inboxId: string }).inboxId);
      }

      // Sync with network before exposing client.
      try {
        await (c as unknown as { sendSyncRequest?: () => Promise<void> }).sendSyncRequest?.();
      } catch {}
      try {
        await c.conversations.sync();
      } catch {}

      ownedBy.current = me;
      setClient(c as unknown as Client);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [address, isConnected]);

  // Disconnect on wallet change / disconnect.
  useEffect(() => {
    if (!isConnected) {
      if (ownedBy.current) disconnect();
      return;
    }
    if (address && ownedBy.current && ownedBy.current !== address.toLowerCase()) {
      disconnect();
    }
  }, [address, isConnected, disconnect]);

  // Populate store + start streams when client is ready.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const bump = () => {
      if (!cancelled) setTick((t) => t + 1);
    };

    let convStream: { end: () => Promise<unknown> } | null = null;
    let msgStream: { end: () => Promise<unknown> } | null = null;

    (async () => {
      try {
        // Load initial conversation list into Zustand store.
        const [dms, groups] = await Promise.all([
          client.conversations.listDms({ consentStates: [0, 1] as never }),
          (client.conversations as unknown as {
            listGroups: (opts: unknown) => Promise<unknown[]>;
          }).listGroups({ consentStates: [0, 1] as never }),
        ]);
        if (!cancelled) {
          await addConversations([
            ...(dms as unknown[]),
            ...(groups as unknown[]),
          ] as Parameters<typeof addConversations>[0]);
          bump();
        }

        // Stream new conversations → add to store.
        convStream = (await client.conversations.stream({
          onValue: (conv: unknown) => {
            void addConversation(conv as Parameters<typeof addConversation>[0]);
            bump();
          },
        })) as { end: () => Promise<unknown> };

        // Stream all messages → add to store + bump tick.
        msgStream = (await client.conversations.streamAllMessages({
          onValue: (message: unknown) => {
            const m = message as { conversationId: string };
            void addMessage(m.conversationId, m as Parameters<typeof addMessage>[1]);
            bump();
          },
          consentStates: [0, 1] as never,
        })) as { end: () => Promise<unknown> };
      } catch (e) {
        console.error('[xmtp] stream setup failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      convStream?.end().catch(() => {});
      msgStream?.end().catch(() => {});
    };
  }, [client, addConversations, addConversation, addMessage]);

  return (
    <XmtpContext.Provider value={{ client, status, error, tick, connect, disconnect }}>
      {children}
    </XmtpContext.Provider>
  );
}

export function useXmtp() {
  return useContext(XmtpContext);
}
