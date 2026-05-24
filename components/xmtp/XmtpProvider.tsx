'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { Client } from '@xmtp/browser-sdk';

import { useWallet } from '@/hooks/use-wallet';

type Status = 'idle' | 'connecting' | 'ready' | 'error';

/**
 * Returns a stable per-wallet 32-byte AES key used to encrypt the XMTP
 * OPFS database. Persisting it in localStorage means we can reopen the
 * same DB across reloads — same key + same dbPath = same installation,
 * which is what stops iOS from minting a fresh one every refresh.
 */
function getOrCreateDbKey(address: string): Uint8Array {
  const storageKey = `xmtp-db-key:${address}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      const bin = atob(existing);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      if (out.byteLength === 32) return out;
    }
  }
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  if (typeof window !== 'undefined' && window.localStorage) {
    let bin = '';
    for (let i = 0; i < fresh.byteLength; i++) bin += String.fromCharCode(fresh[i]);
    try {
      window.localStorage.setItem(storageKey, btoa(bin));
    } catch {
      // Storage full / disabled — DB will reopen as fresh on next visit.
    }
  }
  return fresh;
}

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
      // Storage Access API: iOS Safari + other browsers partition iframe
      // storage to the parent site by default. Without storage access the
      // XMTP OPFS DB is wiped between visits, so every refresh allocates a
      // fresh installation — burning through the 10-installation cap fast.
      // Best-effort; ignored where unsupported or not iframed.
      try {
        if (
          typeof document !== 'undefined' &&
          'requestStorageAccess' in document &&
          window.top !== window.self
        ) {
          await (document as Document & { requestStorageAccess: () => Promise<void> })
            .requestStorageAccess();
        }
      } catch {
        // User denied or browser doesn't support it — proceed; we'll fall
        // back to recovering from the 10/10 error below.
      }

      const sdk = await import('@xmtp/browser-sdk');
      const { Client, createBackend, getInboxIdForIdentifier } = sdk;
      const { buildXmtpSigner } = await import('@/lib/xmtp/signer');
      const { ALL_CODECS } = await import('@/lib/xmtp/codecs');
      const signer = await buildXmtpSigner(address);

      const me = address.toLowerCase();
      const dbPath = `xmtp-${me}.db3`;
      const dbEncryptionKey = getOrCreateDbKey(me);

      const baseOptions = {
        env: 'production',
        codecs: ALL_CODECS,
        dbPath,
        dbEncryptionKey,
      } as unknown as Parameters<typeof Client.create>[1];

      let c: Client;
      try {
        c = (await Client.create(signer, baseOptions)) as unknown as Client;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Recover from "already registered 10/10 installations" by revoking
        // every existing installation, then retrying. This costs the user
        // one extra signature but avoids needing them to revoke manually.
        if (/10\s*\/\s*10\s+installations/i.test(msg)) {
          const backend = await createBackend({
            env: 'production',
          } as unknown as Parameters<typeof createBackend>[0]);
          const identifier = await signer.getIdentifier();
          const inboxId = await getInboxIdForIdentifier(backend, identifier);
          if (!inboxId) throw e;
          const states = await Client.fetchInboxStates([inboxId], backend);
          const installationBytes = states[0]?.installations.map((i) => i.bytes) ?? [];
          if (installationBytes.length === 0) throw e;
          await Client.revokeInstallations(signer, inboxId, installationBytes, backend);
          c = (await Client.create(signer, baseOptions)) as unknown as Client;
        } else {
          throw e;
        }
      }

      ownedBy.current = me;
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
