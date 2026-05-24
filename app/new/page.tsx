'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import {
  IconCamera,
  IconCreditCard,
  IconGif,
  IconLoader2,
  IconPhoto,
  IconPlugConnected,
  IconReceipt,
  IconX,
} from '@tabler/icons-react';

import { useNewMode } from '@/components/new/new-mode';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FromCombobox } from '@/components/wallet/FromCombobox';
import { GifDrawer } from '@/components/wallet/GifDrawer';
import { MessageCard } from '@/components/wallet/MessageCard';
import { TOKENS, TokenDrawer, type Token } from '@/components/wallet/TokenDrawer';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';

type Attachment =
  | { kind: 'file'; id: string; url: string; name: string }
  | { kind: 'gif'; id: string; url: string; name: string };

export default function NewPage() {
  const { mode } = useNewMode();
  const { isConnected } = useWallet();
  const { status, error, connect } = useXmtp();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<Token>(TOKENS[0]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Revoke object URLs on unmount. Only 'file' kind owns a blob URL; 'gif'
  // points at a static asset and must not be revoked.
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((a) => {
        if (a.kind === 'file') URL.revokeObjectURL(a.url);
      });
    };
  }, []);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      next.push({
        kind: 'file',
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        url: URL.createObjectURL(file),
      });
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  };

  const addGif = (gif: { id: string; src: string; name: string }) => {
    setAttachments((prev) => [
      ...prev,
      { kind: 'gif', id: `gif-${gif.id}-${Math.random().toString(36).slice(2, 6)}`, name: gif.name, url: gif.src },
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target && target.kind === 'file') URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
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
        <FromCombobox />
      </div>

      {/* Message — text input with quick-pick emoji row. */}
      <div className="flex flex-col gap-2">
        <div className="px-1">
          <span className="text-sm font-medium text-muted-foreground">Message</span>
        </div>
        <MessageCard value={message} onChange={setMessage} />
      </div>

      {/* Attachment previews — thumbnails with remove buttons. */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative size-20 overflow-hidden rounded-md border bg-muted"
            >
              <Image
                src={a.url}
                alt={a.name}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground shadow hover:bg-background"
              >
                <IconX className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attachments — own section, 3 equal columns, no separators. */}
      <div className="flex">
        <GifDrawer
          onSelect={addGif}
          trigger={
            <button
              type="button"
              className="flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              <IconGif className="size-6 shrink-0" />
              <span>GIF</span>
            </button>
          }
        />
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          className="flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          <IconPhoto className="size-6 shrink-0" />
          <span>Photo</span>
        </button>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          <IconCamera className="size-6 shrink-0" />
          <span>Take photo</span>
        </button>
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Submit. */}
      <Button type="button" size="lg" className="h-14 w-full text-base">
        {isSplit ? 'Split' : 'Request'} {token.symbol}
      </Button>
    </div>
  );
}
