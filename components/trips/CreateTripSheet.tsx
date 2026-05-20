'use client';

import { IconLoader2, IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
import { useWallet } from '@/hooks/use-wallet';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { createTrip } from '@/lib/xmtp/trips';

const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());

export function CreateTripSheet({ onCreated }: { onCreated?: () => void }) {
  const { address } = useWallet();
  const { client } = useXmtp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EURe');
  // Comma- or newline-separated addresses. Creator is added automatically.
  const [membersText, setMembersText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState<string[]>([]);

  const memberList = membersText
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allAddrsValid = memberList.every(isAddress);
  const hasMembers = memberList.length >= 1;
  const formValid = !!client && !!address && name.trim().length > 0 && hasMembers && allAddrsValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !address || !formValid) return;
    setSubmitting(true);
    setError(null);
    setUnreachable([]);
    try {
      // XMTP MLS requires every member to have an inbox already registered.
      // Pre-flight with canMessage so we can surface unreachable addresses
      // instead of hitting `GroupError::AddressNotFound` mid-creation.
      const identifiers = memberList.map((m) => ({
        identifier: m.toLowerCase(),
        identifierKind: 0 as const,
      }));
      const reachable = await client.canMessage(identifiers);
      const missing = memberList.filter(
        (m) => !reachable.get(m.toLowerCase()),
      );
      if (missing.length > 0) {
        setUnreachable(missing);
        setError(
          `${missing.length} address(es) have no XMTP identity yet. They must open an XMTP-enabled app once before you can invite them.`,
        );
        return;
      }

      const trip = await createTrip(client, {
        name: name.trim(),
        currency: currency.trim() || 'EURe',
        members: memberList,
        creator: address,
      });
      setOpen(false);
      setName('');
      setMembersText('');
      onCreated?.();
      router.push(`/groups/${trip.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button type="button" size="sm">
            <IconPlus className="size-4" />
            New trip
          </Button>
        }
      />
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New trip</SheetTitle>
          <SheetDescription>
            Creates an encrypted XMTP group with the invitees. Each invitee accepts the
            group on their device to start logging expenses.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6"
        >
          <Field label="Name *">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mallorca 2026"
              required
            />
          </Field>
          <Field label="Currency *">
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="EURe"
              required
            />
          </Field>
          <Field
            label="Invitees *"
            hint="Comma- or newline-separated wallet addresses. You'll be added automatically as creator."
          >
            <textarea
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
              placeholder="0x… , 0x…"
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              required
            />
            {membersText && !allAddrsValid && (
              <span className="text-xs text-destructive">One or more addresses invalid.</span>
            )}
          </Field>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p>{error}</p>
              {unreachable.length > 0 && (
                <ul className="mt-1 list-disc pl-4 font-mono text-xs">
                  {unreachable.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button type="submit" size="lg" className="mt-2" disabled={!formValid || submitting}>
            {submitting && <IconLoader2 className="size-4 animate-spin" />}
            {submitting ? 'Creating…' : 'Create trip'}
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
