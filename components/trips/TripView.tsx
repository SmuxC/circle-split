'use client';

import {
  IconLoader2,
  IconMessage,
  IconReceiptEuro,
  IconSend,
  IconUserPlus,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Group } from '@xmtp/browser-sdk';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/hooks/use-wallet';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { cn, shortenAddress } from '@/lib/utils';
import {
  addTripMember,
  fetchTripMessages,
  loadTripSummary,
  postExpense,
  type TripMessage,
  type TripSummary,
} from '@/lib/xmtp/trips';

type View = 'chat' | 'invoices';

const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());

export function TripView({ conversationId }: { conversationId: string }) {
  const { client, status, tick } = useXmtp();
  const { address } = useWallet();

  const [group, setGroup] = useState<Group | null>(null);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [view, setView] = useState<View>('chat');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Compose UI mode + values.
  const [mode, setMode] = useState<'text' | 'expense'>('text');
  const [text, setText] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expLabel, setExpLabel] = useState('');
  const [sending, setSending] = useState(false);

  // Add-member modal state.
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const g = (await client.conversations.getConversationById(
          conversationId,
        )) as Group | undefined;
        if (!g) {
          if (!cancelled) setError('Trip not found in your XMTP inbox.');
          return;
        }
        if (cancelled) return;
        const s = await loadTripSummary(g);
        if (!s) {
          if (!cancelled) setError('Group is not a valid trip (failed init validation).');
          return;
        }
        if (cancelled) return;
        const msgs = await fetchTripMessages(g, s.tripId);
        if (cancelled) return;
        setGroup(g);
        setSummary(s);
        setMessages(msgs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, conversationId, refreshKey, tick]);

  const visibleMessages = useMemo(() => {
    if (view === 'invoices') return messages.filter((m) => m.kind === 'expense');
    return messages;
  }, [messages, view]);

  const totals = useMemo(() => {
    const sums = new Map<string, number>();
    let grand = 0;
    for (const m of messages) {
      if (m.kind !== 'expense') continue;
      const amt = Number(m.payload.amount);
      if (!isFinite(amt)) continue;
      sums.set(m.payload.payer, (sums.get(m.payload.payer) ?? 0) + amt);
      grand += amt;
    }
    return { byPayer: sums, grand };
  }, [messages]);

  async function handleSendText() {
    if (!group || !text.trim()) return;
    setSending(true);
    try {
      await group.sendText(text.trim());
      setText('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function handleSendExpense() {
    if (!group || !summary || !address) return;
    const amt = expAmount.trim();
    const label = expLabel.trim();
    if (!amt || !label || isNaN(Number(amt)) || Number(amt) <= 0) return;
    setSending(true);
    try {
      await postExpense(group, {
        tripId: summary.tripId,
        payer: address,
        amount: amt,
        currency: summary.currency,
        label,
      });
      setExpAmount('');
      setExpLabel('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function handleAddMember() {
    if (!group || !summary || !client) return;
    const m = newMember.trim();
    if (!isAddress(m)) {
      setAddError('Invalid address.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      // XMTP rejects addMembers for wallets without a registered inbox.
      const reachable = await client.canMessage([
        { identifier: m.toLowerCase(), identifierKind: 0 as const },
      ]);
      if (!reachable.get(m.toLowerCase())) {
        setAddError(
          'This wallet has no XMTP identity yet. They must open an XMTP-enabled app once before being added.',
        );
        return;
      }
      await addTripMember(group, { tripId: summary.tripId, member: m });
      setNewMember('');
      setShowAddMember(false);
      refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  if (status !== 'ready' || !client) {
    return (
      <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
        Connect to XMTP first to open this trip.
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="px-4 py-3 text-sm text-destructive">
        {error}{' '}
        <Link href="/groups" className="underline">
          Back to trips
        </Link>
      </Card>
    );
  }

  if (!summary || !group) return null;

  const isCreator = address?.toLowerCase() === summary.creator.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{summary.name}</h2>
            <p className="text-xs text-muted-foreground">
              {summary.members.length} members · {summary.currency} · trip id{' '}
              <span className="font-mono">{summary.tripId.slice(0, 8)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-md border border-input">
              <button
                type="button"
                onClick={() => setView('chat')}
                aria-pressed={view === 'chat'}
                title="Show chat + invoices"
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 text-xs',
                  view === 'chat' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                <IconMessage className="size-4" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => setView('invoices')}
                aria-pressed={view === 'invoices'}
                title="Show only invoices"
                className={cn(
                  'flex items-center gap-1 border-l border-input px-2.5 py-1 text-xs',
                  view === 'invoices'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <IconReceiptEuro className="size-4" />
                Invoices
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAddMember(true);
                setAddError(null);
              }}
            >
              <IconUserPlus className="size-4" />
              Add
            </Button>
          </div>
        </div>

        {/* Totals */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">Totals:</span>
          <span className="font-mono font-semibold">
            {totals.grand.toFixed(2)} {summary.currency}
          </span>
          {[...totals.byPayer.entries()].map(([payer, amt]) => (
            <span
              key={payer}
              className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]"
              title={payer}
            >
              {shortenAddress(payer)}: {amt.toFixed(2)}
            </span>
          ))}
        </div>
      </Card>

      {/* Add-member modal */}
      {showAddMember && (
        <Card className="flex flex-col gap-3 border-amber-300 px-4 py-3 dark:border-amber-700">
          <div>
            <h3 className="text-sm font-semibold">Add member</h3>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              ⚠ XMTP encrypts past messages only to members who were in the group when
              the message was sent. The new member will <strong>not</strong> see expenses
              or chat history posted before they joined.
            </p>
          </div>
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="0x… wallet address"
          />
          {addError && (
            <p className="text-xs text-destructive">{addError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowAddMember(false)}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddMember}
              disabled={adding || !isAddress(newMember)}
            >
              {adding && <IconLoader2 className="size-4 animate-spin" />}
              {adding ? 'Adding…' : 'Add member'}
            </Button>
          </div>
        </Card>
      )}

      {/* Message list */}
      <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
        {visibleMessages.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            {view === 'invoices' ? 'No invoices yet.' : 'No messages yet.'}
          </Card>
        ) : (
          visibleMessages.map((m) => (
            <MessageRow key={m.id} m={m} currency={summary.currency} me={address ?? ''} />
          ))
        )}
      </div>

      {/* Composer */}
      <Card className="flex flex-col gap-2 px-3 py-3">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={cn(
              'rounded px-2 py-1 text-xs',
              mode === 'text' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <IconMessage className="mr-1 inline size-3.5" />
            Message
          </button>
          <button
            type="button"
            onClick={() => setMode('expense')}
            className={cn(
              'rounded px-2 py-1 text-xs',
              mode === 'expense'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
            )}
          >
            <IconReceiptEuro className="mr-1 inline size-3.5" />
            Invoice
          </button>
        </div>

        {mode === 'text' ? (
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder="Write a message"
              disabled={sending}
            />
            <Button
              type="button"
              onClick={handleSendText}
              disabled={sending || !text.trim()}
            >
              {sending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder={`Amount (${summary.currency})`}
              disabled={sending}
            />
            <Input
              value={expLabel}
              onChange={(e) => setExpLabel(e.target.value)}
              placeholder="What for"
              disabled={sending}
            />
            <Button
              type="button"
              onClick={handleSendExpense}
              disabled={
                sending ||
                !expAmount ||
                !expLabel ||
                isNaN(Number(expAmount)) ||
                Number(expAmount) <= 0
              }
            >
              {sending ? <IconLoader2 className="size-4 animate-spin" /> : 'Add'}
            </Button>
          </div>
        )}
        {!isCreator && (
          <p className="text-xs text-muted-foreground">
            Only the trip creator should add members. Anyone can post messages and invoices.
          </p>
        )}
      </Card>
    </div>
  );
}

function MessageRow({ m, currency, me }: { m: TripMessage; currency: string; me: string }) {
  const mine = m.sender.toLowerCase() === me.toLowerCase();
  const when = new Date(m.ts * 1000).toLocaleString();
  const wrap = (children: React.ReactNode) => (
    <div className={cn('flex flex-col gap-1', mine && 'items-end')}>
      <div className="text-[10px] text-muted-foreground">
        <span className="font-mono">{shortenAddress(m.sender)}</span> · {when}
      </div>
      {children}
    </div>
  );

  if (m.kind === 'text') {
    return wrap(
      <div
        className={cn(
          'max-w-[80%] rounded-md px-3 py-2 text-sm',
          mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {m.text}
      </div>,
    );
  }
  if (m.kind === 'expense') {
    return wrap(
      <div
        className={cn(
          'flex max-w-[80%] items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm',
        )}
      >
        <IconReceiptEuro className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col leading-tight">
          <span className="font-semibold">{m.payload.label}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {Number(m.payload.amount).toFixed(2)} {m.payload.currency || currency}
          </span>
        </div>
      </div>,
    );
  }
  if (m.kind === 'member-added') {
    return wrap(
      <div className="rounded-md bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        Added <span className="font-mono">{shortenAddress(m.payload.member)}</span> to the trip.
        New member cannot see earlier messages.
      </div>,
    );
  }
  return null;
}
