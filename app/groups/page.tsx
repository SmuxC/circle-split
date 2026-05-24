'use client';

import {
  IconLoader2,
  IconMessage,
  IconMessages,
  IconPlugConnected,
  IconPlus,
  IconUsers,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { shortenAddress } from '@/lib/utils';
import { listAllConversations, type DmSummary } from '@/lib/xmtp/dms';
import { useInboxStore } from '@/lib/xmtp/store';

export default function GroupsPage() {
  const { isConnected } = useWallet();
  const { client, status, error, connect, tick } = useXmtp();
  const sortedConversations = useInboxStore((s) => s.sortedConversations);
  const metadata = useInboxStore((s) => s.metadata);

  const [items, setItems] = useState<DmSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // New DM state
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newDmAddr, setNewDmAddr] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // New Group state
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupAddrs, setGroupAddrs] = useState(['']);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupCreateError, setGroupCreateError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (sortedConversations.length > 0) {
        const mapped: DmSummary[] = sortedConversations.map((c) => {
          const meta = metadata.get(c.id);
          return {
            conversationId: c.id,
            peer: meta?.identifier ?? meta?.name ?? c.name ?? c.id,
            consentState: 1,
            lastTs: 0,
            lastPreview: '',
            isDm: c.isDm,
            name: meta?.name,
          };
        });
        if (!cancelled) setItems(mapped);
        return;
      }
      if (!client || status !== 'ready') return;
      setLoading(true);
      try {
        const all = await listAllConversations(client);
        if (!cancelled) setItems(all);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedConversations, client, status, tick]);

  const handleNewDm = useCallback(async () => {
    if (!client || !newDmAddr.trim()) return;
    const addr = newDmAddr.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) {
      setCreateError('Enter a valid 0x Ethereum address.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const dm = await client.conversations.createDmWithIdentifier({
        identifier: addr,
        identifierKind: 0 as never,
      }) as { id: string };
      setNewDmOpen(false);
      setNewDmAddr('');
      window.location.href = `/dms/${dm.id}`;
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create DM.');
    } finally {
      setCreating(false);
    }
  }, [client, newDmAddr]);

  const handleNewGroup = useCallback(async () => {
    if (!client) return;
    const valid = groupAddrs
      .map((a) => a.trim().toLowerCase())
      .filter((a) => /^0x[a-f0-9]{40}$/.test(a));
    if (valid.length === 0) {
      setGroupCreateError('Add at least one valid 0x address.');
      return;
    }
    setCreatingGroup(true);
    setGroupCreateError('');
    try {
      const identifiers = valid.map((addr) => ({ identifier: addr, identifierKind: 0 as never }));
      const group = await (client.conversations as unknown as {
        createGroupWithIdentifiers: (
          ids: unknown[],
          opts?: { groupName?: string },
        ) => Promise<{ id: string }>;
      }).createGroupWithIdentifiers(identifiers, groupName.trim() ? { groupName: groupName.trim() } : undefined);
      setNewGroupOpen(false);
      setGroupAddrs(['']);
      setGroupName('');
      window.location.href = `/groups/${group.id}`;
    } catch (e) {
      setGroupCreateError(e instanceof Error ? e.message : 'Could not create group.');
    } finally {
      setCreatingGroup(false);
    }
  }, [client, groupAddrs, groupName]);

  if (!isConnected) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader />
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <IconMessages className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect via the Circles host to chat.</p>
        </Card>
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader />
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <IconPlugConnected className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect to XMTP to see your messages.</p>
          {status === 'error' && error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}
          <Button onClick={connect} disabled={status === 'connecting'}>
            {status === 'connecting' && <IconLoader2 className="size-4 animate-spin" />}
            {status === 'connecting' ? 'Signing…' : 'Connect XMTP'}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <PageHeader />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setNewDmOpen(true); setNewGroupOpen(false); }}
          >
            <IconPlus className="size-4" />
            New DM
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setNewGroupOpen(true); setNewDmOpen(false); }}
          >
            <IconPlus className="size-4" />
            New Group
          </Button>
        </div>
      </div>

      {newDmOpen && (
        <Card className="flex flex-col gap-2 px-4 py-4">
          <p className="text-sm font-medium">Start a new DM</p>
          <div className="flex gap-2">
            <Input
              placeholder="0x… Ethereum address"
              value={newDmAddr}
              onChange={(e) => setNewDmAddr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNewDm()}
              className="h-9 flex-1"
            />
            <Button size="sm" onClick={handleNewDm} disabled={creating || !newDmAddr.trim()}>
              {creating ? <IconLoader2 className="size-4 animate-spin" /> : 'Open'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setNewDmOpen(false); setNewDmAddr(''); setCreateError(''); }}
            >
              Cancel
            </Button>
          </div>
          {createError && <p className="text-xs text-destructive">{createError}</p>}
        </Card>
      )}

      {newGroupOpen && (
        <Card className="flex flex-col gap-3 px-4 py-4">
          <p className="text-sm font-medium">Create a group chat</p>
          <Input
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="h-9"
          />
          <div className="flex flex-col gap-2">
            {groupAddrs.map((addr, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="0x… Ethereum address"
                  value={addr}
                  onChange={(e) => {
                    const next = [...groupAddrs];
                    next[i] = e.target.value;
                    setGroupAddrs(next);
                  }}
                  className="h-9 flex-1"
                />
                {groupAddrs.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setGroupAddrs(groupAddrs.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setGroupAddrs([...groupAddrs, ''])}
              className="self-start text-xs text-muted-foreground hover:text-foreground"
            >
              + Add member
            </button>
          </div>
          {groupCreateError && <p className="text-xs text-destructive">{groupCreateError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setNewGroupOpen(false); setGroupAddrs(['']); setGroupName(''); setGroupCreateError(''); }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleNewGroup} disabled={creatingGroup}>
              {creatingGroup ? <IconLoader2 className="size-4 animate-spin" /> : 'Create Group'}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <IconMessages className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
          <p className="text-xs text-muted-foreground">Start a DM or join a group.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.conversationId}>
              <ConversationRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Conversation row ──────────────────────────────────────────────────────────

type CirclesProfile = { name: string; avatarUrl?: string };

function ConversationRow({ item }: { item: DmSummary }) {
  const [profile, setProfile] = useState<CirclesProfile | null>(null);

  useEffect(() => {
    if (!item.isDm || !item.peer) return;
    let cancelled = false;
    (async () => {
      try {
        const { Sdk } = await import('@aboutcircles/sdk');
        const sdk = new Sdk();
        const view = await sdk.rpc.profile.getProfileView(item.peer as `0x${string}`);
        if (cancelled) return;
        if (!view?.avatarInfo?.cidV0) {
          setProfile({ name: shortenAddress(item.peer) });
          return;
        }
        const full = await sdk.rpc.profile.getProfileByCid(view.avatarInfo.cidV0);
        if (!cancelled) {
          setProfile({
            name: full?.name || shortenAddress(item.peer),
            avatarUrl: full?.previewImageUrl || full?.imageUrl,
          });
        }
      } catch {
        if (!cancelled) setProfile({ name: shortenAddress(item.peer) });
      }
    })();
    return () => { cancelled = true; };
  }, [item.peer, item.isDm]);

  const displayName = item.isDm
    ? (profile?.name ?? shortenAddress(item.peer))
    : (item.name ?? item.peer);

  return (
    <Link
      href={item.isDm ? `/dms/${item.conversationId}` : `/groups/${item.conversationId}`}
      className="block"
    >
      <Card className="flex-row items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/50">
        <AvatarCircle
          url={item.isDm ? profile?.avatarUrl : undefined}
          name={displayName}
          isDm={item.isDm}
        />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{displayName}</span>
          {item.lastPreview && (
            <span className="truncate text-xs text-muted-foreground">{item.lastPreview}</span>
          )}
        </div>
        {item.lastTs > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {new Date(item.lastTs * 1000).toLocaleDateString()}
          </span>
        )}
      </Card>
    </Link>
  );
}

function AvatarCircle({ url, name, isDm }: { url?: string; name: string; isDm: boolean }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} className="size-10 shrink-0 rounded-full object-cover" />
    );
  }
  const letter = name?.[0]?.toUpperCase();
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
      {isDm ? (letter || <IconMessage className="size-4" />) : <IconUsers className="size-4" />}
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
      <p className="text-sm text-muted-foreground">DMs and group chats over XMTP.</p>
    </div>
  );
}
