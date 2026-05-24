'use client';

import { useState, useMemo } from 'react';

import {
  IconLoader2,
  IconPlugConnected,
  IconReceipt,
  IconUsers,
} from '@tabler/icons-react';

import { useNewMode } from '@/components/new/new-mode';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FromCombobox } from '@/components/wallet/FromCombobox';
import { MessageCard } from '@/components/wallet/MessageCard';
import { ShareRequestSheet, type ShareRequest } from '@/components/wallet/ShareRequestSheet';
import { TOKENS, TokenDrawer, type Token } from '@/components/wallet/TokenDrawer';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { cn, shortenAddress } from '@/lib/utils';
import { computeShares, sendBillSplit, type SplitType } from '@/lib/xmtp/bills';
import { useInboxStore } from '@/lib/xmtp/store';

// ── Hardcoded demo transactions ───────────────────────────────────────────────

const MOCK_TRANSACTIONS = [
  { id: '1', merchant: 'Restaurant Centrale', amount: '68.40', currency: 'EUR', emoji: '🍽️' },
  { id: '2', merchant: 'Coffee Shop Brew', amount: '12.80', currency: 'EUR', emoji: '☕' },
  { id: '3', merchant: 'Taxi Ride', amount: '24.50', currency: 'EUR', emoji: '🚕' },
  { id: '4', merchant: 'Grocery Run', amount: '87.30', currency: 'EUR', emoji: '🛒' },
  { id: '5', merchant: 'Movie Night', amount: '45.00', currency: 'EUR', emoji: '🎬' },
];

// ── Split page ────────────────────────────────────────────────────────────────

function BillSplitPage() {
  const { client, status, error: xmtpError, connect } = useXmtp();
  const { address, isConnected } = useWallet();
  const sortedConversations = useInboxStore((s) => s.sortedConversations);
  const metadata = useInboxStore((s) => s.metadata);
  const storeMembers = useInboxStore((s) => s.members);

  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [splitCurrency, setSplitCurrency] = useState('EUR');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [manualAmounts, setManualAmounts] = useState<Map<string, string>>(new Map());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const selectedTx = MOCK_TRANSACTIONS.find((t) => t.id === selectedTxId) ?? null;

  const handleSelectTx = (tx: (typeof MOCK_TRANSACTIONS)[0]) => {
    setSelectedTxId(tx.id);
    setSplitAmount(tx.amount);
    setSplitCurrency(tx.currency);
    setDescription(tx.merchant);
  };

  const selectedConv = selectedConvId
    ? sortedConversations.find((c) => c.id === selectedConvId) ?? null
    : null;

  const convMembersMap = selectedConvId ? storeMembers.get(selectedConvId) : undefined;
  const memberAddresses = useMemo(
    () =>
      convMembersMap
        ? [...convMembersMap.values()]
            .map((m) => m.accountIdentifiers.find((id) => id.identifierKind === 0)?.identifier)
            .filter(Boolean) as string[]
        : [],
    [convMembersMap],
  );

  const shares = useMemo(() => {
    if (!splitAmount || !address || memberAddresses.length === 0) return [];
    return computeShares(
      splitAmount,
      memberAddresses,
      address,
      splitType,
      splitType === 'manual' ? manualAmounts : undefined,
    );
  }, [splitAmount, address, memberAddresses, splitType, manualAmounts]);

  const canSend =
    !!client &&
    !!address &&
    !!selectedConvId &&
    !!splitAmount &&
    Number(splitAmount) > 0 &&
    shares.length > 0;

  const handleSend = async () => {
    if (!client || !address || !selectedConvId) return;
    setSending(true);
    setSendError(null);
    try {
      const conv = await client.conversations.getConversationById(selectedConvId);
      if (!conv) throw new Error('Conversation not found');
      await sendBillSplit(conv as unknown as { send: (c: unknown) => Promise<unknown> }, {
        description: description || selectedTx?.merchant || 'Bill Split',
        totalAmount: splitAmount,
        symbol: splitCurrency,
        creator: address,
        shares,
      });
      const isGroup = !selectedConv?.isDm;
      window.location.href = isGroup ? `/groups/${selectedConvId}` : `/dms/${selectedConvId}`;
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconReceipt className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Connect via the Circles host to split bills.</p>
      </Card>
    );
  }

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <IconPlugConnected className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Connect to XMTP to split bills.</p>
        {status === 'error' && xmtpError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {xmtpError}
          </p>
        )}
        <Button type="button" onClick={connect} disabled={status === 'connecting'}>
          {status === 'connecting' && <IconLoader2 className="size-4 animate-spin" />}
          {status === 'connecting' ? 'Signing…' : 'Connect XMTP'}
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {/* Step 1: transactions */}
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Recent transactions</span>
        </div>
        <div className="flex flex-col gap-2">
          {MOCK_TRANSACTIONS.map((tx) => (
            <button
              key={tx.id}
              type="button"
              onClick={() => handleSelectTx(tx)}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                selectedTxId === tx.id
                  ? 'border-foreground bg-accent'
                  : 'border-border bg-card hover:bg-accent/50',
              )}
            >
              <span className="text-xl">{tx.emoji}</span>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="text-sm font-semibold">{tx.merchant}</span>
              </div>
              <span className="font-mono text-sm font-semibold">
                {tx.amount} {tx.currency}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: amount + description */}
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Amount</span>
        </div>
        <Card className="overflow-hidden p-0 py-0">
          <div className="flex items-stretch">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              value={splitAmount}
              onKeyDown={(e) => {
                if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
              }}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || Number(v) >= 0) setSplitAmount(v);
              }}
              className="h-14 flex-1 rounded-none border-0 bg-transparent px-4 text-2xl font-semibold focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <div className="flex items-center border-l px-4">
              <span className="text-sm font-semibold text-muted-foreground">{splitCurrency}</span>
            </div>
          </div>
        </Card>
        <Input
          placeholder="Description (e.g. Dinner at Centrale)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-10"
        />
      </div>

      {/* Step 3: conversation picker */}
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Send to</span>
        </div>
        {sortedConversations.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-6 text-center">
            <IconUsers className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No conversations yet. Start a DM or group first.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-1 rounded-xl border bg-card">
            {sortedConversations.map((conv) => {
              const meta = metadata.get(conv.id);
              const name = meta?.name ?? conv.name ?? conv.id;
              const isSelected = selectedConvId === conv.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConvId(conv.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    isSelected ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {conv.isDm ? (name[0]?.toUpperCase() ?? '?') : <IconUsers className="size-4" />}
                  </span>
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-sm font-semibold">
                      {conv.isDm ? shortenAddress(name) : name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {conv.isDm ? 'DM' : 'Group'}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-xs font-semibold text-foreground">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 4: split options */}
      {selectedConvId && splitAmount && Number(splitAmount) > 0 && memberAddresses.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="px-1">
            <span className="text-sm font-medium text-muted-foreground">How to split</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { type: 'equal' as SplitType, label: 'Split equally' },
                { type: 'i-pay-half' as SplitType, label: 'I pay 50%' },
                { type: 'others-half' as SplitType, label: 'Others pay 50%' },
                { type: 'manual' as SplitType, label: 'Manual' },
              ] as const
            ).map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                  splitType === type
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card hover:bg-accent/50',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {splitType === 'manual' && memberAddresses.length > 0 && (
            <div className="flex flex-col gap-2">
              {memberAddresses
                .filter((a) => a.toLowerCase() !== address?.toLowerCase())
                .map((addr) => (
                  <div key={addr} className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs text-muted-foreground">
                      {shortenAddress(addr)}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Amount"
                      value={manualAmounts.get(addr) ?? ''}
                      onChange={(e) => {
                        const next = new Map(manualAmounts);
                        next.set(addr, e.target.value);
                        setManualAmounts(next);
                      }}
                      className="h-9 w-32"
                    />
                    <span className="text-xs text-muted-foreground">{splitCurrency}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Preview */}
          {shares.length > 0 && (
            <Card className="flex flex-col gap-1 px-3 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Each member owes
              </span>
              {shares.map((s) => (
                <div key={s.address} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortenAddress(s.address)}
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {s.amount} {splitCurrency}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {sendError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {sendError}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="h-14 w-full text-base"
        onClick={handleSend}
        disabled={!canSend || sending}
      >
        {sending ? (
          <IconLoader2 className="size-5 animate-spin" />
        ) : (
          `Send Bill Split${splitAmount ? ` · ${splitAmount} ${splitCurrency}` : ''}`
        )}
      </Button>
    </div>
  );
}

// ── Payment request page (unchanged logic) ────────────────────────────────────

export default function NewPage() {
  const { mode } = useNewMode();
  const { address, isConnected } = useWallet();
  const { client, status, error, connect } = useXmtp();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<Token>(TOKENS[0]);
  const [recipient, setRecipient] = useState<{ address: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shareReq, setShareReq] = useState<ShareRequest | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  if (mode === 'split') return <BillSplitPage />;

  const buildRequestUrl = (addr: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      to: addr,
      amount: amount || '0',
      token: token.symbol,
    });
    if (message.trim()) params.set('msg', message.trim());
    return `${base}/new?${params.toString()}`;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSentNotice(null);
    if (!recipient) {
      setSubmitError('Pick a recipient from the list.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setSubmitError('Enter an amount.');
      return;
    }
    if (!client || !address) {
      setSubmitError('XMTP client not ready.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await client.canMessage([
        { identifier: recipient.address.toLowerCase(), identifierKind: 0 },
      ]);
      const reachable = result.get(recipient.address.toLowerCase()) === true;
      if (!reachable) {
        setShareReq({
          recipientName: recipient.name,
          amount,
          symbol: token.symbol,
          message: message.trim() || undefined,
          url: buildRequestUrl(recipient.address),
        });
        setShareOpen(true);
        return;
      }

      const { sendPaymentRequest } = await import('@/lib/xmtp/requests');
      await sendPaymentRequest(client, {
        recipient: recipient.address,
        requester: address,
        amount,
        symbol: token.symbol,
        message: message.trim() || undefined,
        mode: 'request',
      });

      setSentNotice(`Sent request for ${amount} ${token.symbol} to ${recipient.name}.`);
      setAmount('');
      setMessage('');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconReceipt className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect via the Circles host to create a request.
        </p>
      </Card>
    );
  }

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <IconPlugConnected className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect to XMTP to send encrypted payment requests.
        </p>
        {status === 'error' && error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <Button type="button" onClick={connect} disabled={status === 'connecting'}>
          {status === 'connecting' && <IconLoader2 className="size-4 animate-spin" />}
          {status === 'connecting' ? 'Signing…' : 'Connect XMTP'}
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Amount</span>
        </div>
        <Card className="overflow-hidden p-0 py-0">
          <div className="flex items-stretch">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              value={amount}
              onKeyDown={(e) => {
                if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
              }}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || Number(v) >= 0) setAmount(v);
              }}
              className="h-14 flex-1 rounded-none border-0 bg-transparent px-4 text-2xl font-semibold focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <TokenDrawer value={token} onChange={setToken} />
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">From</span>
        </div>
        <FromCombobox onSelect={setRecipient} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Message</span>
        </div>
        <MessageCard value={message} onChange={setMessage} />
      </div>

      {submitError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {submitError}
        </p>
      )}
      {sentNotice && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-700">
          {sentNotice}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="h-14 w-full text-base"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <IconLoader2 className="size-5 animate-spin" />
        ) : (
          <>Request {token.symbol}</>
        )}
      </Button>

      <ShareRequestSheet open={shareOpen} onOpenChange={setShareOpen} request={shareReq} />
    </div>
  );
}
