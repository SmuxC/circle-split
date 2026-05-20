'use client';

import { IconLoader2, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';

import { useWallet } from '@/hooks/use-wallet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

type Status =
  | { kind: 'idle' }
  | { kind: 'pinning' }
  | { kind: 'building' }
  | { kind: 'sending' }
  | { kind: 'done'; hash: string }
  | { kind: 'error'; message: string };

function isAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

export function CreateGroupSheet() {
  const { address, isConnected, isMiniappHost } = useWallet();
  const [open, setOpen] = useState(false);

  // BaseGroupFactory.createBaseGroup args + Profile data.
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  // Defaults to caller; empty string falls back to wallet address on submit.
  const [owner, setOwner] = useState('');
  const [service, setService] = useState('');
  const [feeCollection, setFeeCollection] = useState('');
  // Comma- or newline-separated 0x… addresses; passed to factory as
  // `initialConditions` array (entry-gating module addrs).
  const [conditions, setConditions] = useState('');

  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const nameTooLong = name.length > 19;
  const formValid =
    isConnected &&
    name.trim().length > 0 &&
    !nameTooLong &&
    symbol.trim().length > 0 &&
    [owner, service, feeCollection].every((v) => v === '' || isAddress(v));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !formValid) return;

    const ownerAddr = (owner.trim() || address) as `0x${string}`;
    const serviceAddr = (service.trim() || ownerAddr) as `0x${string}`;
    const feeAddr = (feeCollection.trim() || ownerAddr) as `0x${string}`;

    // Parse comma/newline-separated addrs; drop empties; reject invalid.
    const conditionList = conditions
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!conditionList.every(isAddress)) {
      setStatus({ kind: 'error', message: 'Invalid address in initial conditions.' });
      return;
    }

    try {
      setStatus({ kind: 'pinning' });
      const { Sdk } = await import('@aboutcircles/sdk');
      const { cidV0ToHex } = await import('@aboutcircles/sdk-utils');
      const sdk = new Sdk();

      // 1. Pin profile to IPFS — returns CIDv0 string.
      const profile = {
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(imageUrl.trim() && { previewImageUrl: imageUrl.trim() }),
      };
      const cid = await sdk.profiles.create(profile);

      setStatus({ kind: 'building' });
      // 2. CIDv0 → bytes32 metadataDigest (drops the 2-byte multihash prefix).
      const metadataDigest = cidV0ToHex(cid);

      // 3. Build the factory tx. Returns a TransactionRequest the host signs.
      const tx = sdk.core.baseGroupFactory.createBaseGroup(
        ownerAddr,
        serviceAddr,
        feeAddr,
        conditionList as readonly `0x${string}`[],
        name.trim(),
        symbol.trim(),
        metadataDigest,
      );

      setStatus({ kind: 'sending' });
      const { sendTransactions } = await import('@aboutcircles/miniapp-sdk');
      const [hash] = await sendTransactions([
        {
          to: tx.to,
          data: tx.data,
          value: tx.value ? tx.value.toString() : '0',
        },
      ]);
      setStatus({ kind: 'done', hash });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const busy =
    status.kind === 'pinning' || status.kind === 'building' || status.kind === 'sending';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button type="button" size="sm">
            <IconPlus className="size-4" />
            Create group
          </Button>
        }
      />
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create group</SheetTitle>
          <SheetDescription>
            Deploys a new BaseGroup via the factory. Profile is pinned to IPFS; the host
            wallet signs the on-chain registration.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6"
        >
          {!isConnected && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Connect via the Circles host to create a group.
              {!isMiniappHost && ' (Open this app inside circles.gnosis.io/playground.)'}
            </p>
          )}

          <Field label="Name *" hint={`${name.length}/19 — on-chain group name`}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={19}
              placeholder="My Group"
              aria-invalid={nameTooLong}
              required
            />
          </Field>

          <Field label="Symbol *" hint="ERC-1155 token symbol (e.g. MYG)">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="MYG"
              required
            />
          </Field>

          <Field label="Description" hint="Stored in the IPFS profile">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the group is for"
            />
          </Field>

          <Field label="Image URL" hint="Used as previewImageUrl in the profile">
            <Input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…/logo.png"
            />
          </Field>

          <Field label="Owner" hint="Group admin. Defaults to your wallet.">
            <Input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder={address ?? ZERO_ADDR}
              aria-invalid={owner !== '' && !isAddress(owner)}
            />
          </Field>

          <Field label="Service" hint="Service operator addr. Defaults to owner.">
            <Input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder={(owner.trim() || address) ?? ZERO_ADDR}
              aria-invalid={service !== '' && !isAddress(service)}
            />
          </Field>

          <Field label="Fee collection" hint="Receives mint/withdraw fees. Defaults to owner.">
            <Input
              value={feeCollection}
              onChange={(e) => setFeeCollection(e.target.value)}
              placeholder={(owner.trim() || address) ?? ZERO_ADDR}
              aria-invalid={feeCollection !== '' && !isAddress(feeCollection)}
            />
          </Field>

          <Field
            label="Initial conditions"
            hint="Entry-gating module addresses (comma/newline-separated). Empty = open group."
          >
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="0x… , 0x…"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </Field>

          {status.kind === 'error' && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {status.message}
            </p>
          )}
          {status.kind === 'done' && (
            <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Submitted. Tx: <span className="font-mono">{status.hash}</span>
            </p>
          )}

          <Button type="submit" size="lg" className="mt-2" disabled={!formValid || busy}>
            {busy && <IconLoader2 className="size-4 animate-spin" />}
            {status.kind === 'pinning'
              ? 'Pinning profile…'
              : status.kind === 'building'
                ? 'Building tx…'
                : status.kind === 'sending'
                  ? 'Awaiting signature…'
                  : 'Create group'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
