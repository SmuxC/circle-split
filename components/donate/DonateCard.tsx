'use client';

import { IconHeartFilled, IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useWallet } from '@/hooks/use-wallet';
import { shortenAddress } from '@/lib/utils';

const RECIPIENT = '0x199E9B2b6241269b64aa2b9C174840449BdFb6fC' as const;

type Status =
  | { kind: 'idle' }
  | { kind: 'pathfinding' }
  | { kind: 'building' }
  | { kind: 'sending' }
  | { kind: 'done'; hashes: string[] }
  | { kind: 'error'; message: string };

function crcToAtto(crc: string): bigint {
  // Decimal → atto. Avoids float drift by string-splitting.
  const [intPart, fracPart = ''] = crc.split('.');
  const padded = (fracPart + '0'.repeat(18)).slice(0, 18);
  return BigInt(intPart || '0') * 10n ** 18n + BigInt(padded || '0');
}

export function DonateCard() {
  const { address, isConnected } = useWallet();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const num = Number(amount);
  const formValid = isConnected && amount.trim() !== '' && num > 0 && isFinite(num);

  async function handleDonate() {
    if (!address || !formValid) return;
    setStatus({ kind: 'pathfinding' });
    try {
      const { Sdk } = await import('@aboutcircles/sdk');
      const { TransferBuilder } = await import('@aboutcircles/sdk-transfers');
      const { sendTransactions } = await import('@aboutcircles/miniapp-sdk');

      const sdk = new Sdk();
      const builder = new TransferBuilder(sdk.circlesConfig);

      setStatus({ kind: 'building' });
      // Pathfinder routes CRC via the trust network; works even without a
      // direct trust between donor and recipient when intermediaries exist.
      const txs = await builder.constructAdvancedTransfer(
        address as `0x${string}`,
        RECIPIENT,
        crcToAtto(amount.trim()),
      );

      setStatus({ kind: 'sending' });
      const hashes = await sendTransactions(
        txs.map((t) => ({
          to: t.to,
          data: t.data,
          value: t.value ? t.value.toString() : '0',
        })),
      );
      setStatus({ kind: 'done', hashes });
      setAmount('');
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const busy =
    status.kind === 'pathfinding' || status.kind === 'building' || status.kind === 'sending';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconHeartFilled className="size-5 text-rose-500" />
          Donate CRC
        </CardTitle>
        <CardDescription>
          Send Circles to <span className="font-mono">{shortenAddress(RECIPIENT)}</span> via
          pathfinding through the trust network. Host signs the route.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Amount (CRC)</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.00"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
            }}
          />
        </label>

        {status.kind === 'error' && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {status.message}
          </p>
        )}
        {status.kind === 'done' && (
          <div className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <p>Sent. {status.hashes.length} tx hash{status.hashes.length === 1 ? '' : 'es'}:</p>
            <ul className="mt-1 list-disc pl-4 font-mono text-xs">
              {status.hashes.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="button"
          onClick={handleDonate}
          disabled={!formValid || busy}
          className="w-full"
        >
          {busy && <IconLoader2 className="size-4 animate-spin" />}
          {status.kind === 'pathfinding'
            ? 'Finding path…'
            : status.kind === 'building'
              ? 'Building tx…'
              : status.kind === 'sending'
                ? 'Awaiting signature…'
                : `Send ${amount || '0'} CRC`}
        </Button>

        {!isConnected && (
          <p className="text-xs text-muted-foreground">
            Connect via the Circles host to donate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
