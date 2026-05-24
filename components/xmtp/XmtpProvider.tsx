'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { Client } from '@xmtp/browser-sdk';

import { useWallet } from '@/hooks/use-wallet';

type Status = 'idle' | 'connecting' | 'ready' | 'error';

type XmtpContextValue = {
  client: Client | null;
  status: Status;
  error: string | null;
  /** Increments whenever a global XMTP stream emits — components dep on it to refresh. */
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

  // Address that owns the current client; if it changes (wallet rotation),
  // we tear the client down and require an explicit reconnect.
  const ownedBy = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    setClient(null);
    setStatus('idle');
    setError(null);
    ownedBy.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (!address || !isConnected) {
      setError('Wallet not connected.');
      return;
    }
    setStatus('connecting');
    setError(null);
    try {
      const { Client } = await import('@xmtp/browser-sdk');
      const { buildXmtpSigner } = await import('@/lib/xmtp/signer');
      const { ALL_CODECS } = await import('@/lib/xmtp/codecs');
      const signer = await buildXmtpSigner(address);
      // XMTP's ContentCodec generic is invariant and its ClientOptions is a
      // discriminated union; cast at the registration boundary.
      const c = (await Client.create(signer, {
        env: 'production',
        codecs: ALL_CODECS,
      } as unknown as Parameters<typeof Client.create>[1])) as unknown as Client;
      ownedBy.current = address.toLowerCase();
      setClient(c);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (!isConnected) {
      if (ownedBy.current) disconnect();
      return;
    }
    if (
      address &&
      ownedBy.current &&
      ownedBy.current !== address.toLowerCase()
    ) {
      disconnect();
    }
  }, [address, isConnected, disconnect]);

  // Live updates: subscribe to new conversations (invites) and to all incoming
  // group messages. Bump `tick` on every event so dependent views refetch.
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
        // Initial network sync so cached state catches up before streams attach.
        await client.conversations.sync();
        bump();
        // ConsentState: Unknown=0, Allowed=1. Include both so invites that
        // haven't been explicitly accepted yet still surface and stream.
        convStream = (await client.conversations.stream({ onValue: bump })) as {
          end: () => Promise<unknown>;
        };
        // Cover both groups (trips) and DMs (payment requests) with a single
        // stream so any inbound payload bumps tick.
        msgStream = (await client.conversations.streamAllMessages({
          onValue: bump,
          consentStates: [0, 1] as never,
        })) as { end: () => Promise<unknown> };
      } catch (e) {
        // Streams can fail on transient network errors; surface but don't crash.
        console.error('[xmtp] stream setup failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      convStream?.end().catch(() => {});
      msgStream?.end().catch(() => {});
    };
  }, [client]);

  return (
    <XmtpContext.Provider value={{ client, status, error, tick, connect, disconnect }}>
      {children}
    </XmtpContext.Provider>
  );
}

export function useXmtp() {
  return useContext(XmtpContext);
}
