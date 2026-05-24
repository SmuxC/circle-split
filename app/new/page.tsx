'use client';

import { useState } from 'react';

import {
  IconCreditCard,
  IconLoader2,
  IconPlugConnected,
  IconReceipt,
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
      // IdentifierKind.Ethereum = 0 (matches lib/xmtp/signer.ts inline value).
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
        mode: isSplit ? 'split' : 'request',
      });

      setSentNotice(
        `Sent ${isSplit ? 'split' : 'request'} for ${amount} ${token.symbol} to ${recipient.name}.`,
      );
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

  const isSplit = mode === 'split';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {isSplit && (
        <div className="flex flex-col gap-2">
          <div className="px-1">
            <span className="text-sm font-medium text-muted-foreground">
              Gnosis Pay transactions
            </span>
          </div>
          <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <IconCreditCard className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Connect Gnosis Pay to import your latest card transactions.
            </p>
            <Button type="button">Connect Gnosis Pay</Button>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Amount</span>
        </div>

        {/* Card holds the input + button flush — no inner padding so the
            outer Card ring is the only border. Input padding gives text
            margin; the button's border-l draws the only separator. */}
        <Card className="overflow-hidden p-0 py-0">
          <div className="flex items-stretch">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              value={amount}
              onKeyDown={(e) => {
                // Block negative sign and scientific notation entry.
                if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
              }}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || Number(v) >= 0) setAmount(v);
              }}
              className="h-14 flex-1 rounded-none border-0 bg-transparent px-4 text-2xl font-semibold focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {/* Currency selector — opens a bottom drawer with the token list. */}
            <TokenDrawer value={token} onChange={setToken} />
          </div>
        </Card>
      </div>

      {/* From — input with a dropdown of recent contacts. */}
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">From</span>
        </div>
        <FromCombobox onSelect={setRecipient} />
      </div>

      {/* Message — text input with quick-pick emoji row. */}
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
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-700 dark:text-emerald-300">
          {sentNotice}
        </p>
      )}

      {/* Submit. */}
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
          <>
            {isSplit ? 'Split' : 'Request'} {token.symbol}
          </>
        )}
      </Button>

      <ShareRequestSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        request={shareReq}
      />
    </div>
  );
}
