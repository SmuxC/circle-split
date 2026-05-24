'use client';

import {
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconBrandX,
  IconCheck,
  IconCopy,
  IconMail,
  IconShare,
} from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type ShareRequest = {
  recipientName: string;
  amount: string;
  symbol: string;
  message?: string;
  url: string;
};

function buildShareText(req: ShareRequest): string {
  const lines = [
    `Payment request: ${req.amount} ${req.symbol}`,
    req.message && `Note: ${req.message}`,
    req.url,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

export function ShareRequestSheet({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ShareRequest | null;
}) {
  const [copied, setCopied] = useState(false);
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Reset the "Copied" pill when the sheet closes — derived from `open` via
  // state-from-prop pattern (cheaper than an effect, no cascading render).
  const [openSnapshot, setOpenSnapshot] = useState(open);
  if (openSnapshot !== open) {
    setOpenSnapshot(open);
    if (!open) setCopied(false);
  }

  if (!request) return null;

  const text = buildShareText(request);
  const title = `Payment request: ${request.amount} ${request.symbol}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(request.url);
  const encodedTitle = encodeURIComponent(title);
  const encodedBody = encodeURIComponent(text);

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, text, url: request.url });
      onOpenChange(false);
    } catch {
      // User cancelled or share failed; keep sheet open for fallbacks.
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; user can long-press to copy manually.
    }
  };

  const targets: { label: string; href: string; icon: typeof IconBrandTelegram }[] = [
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      icon: IconBrandTelegram,
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodedText}`,
      icon: IconBrandWhatsapp,
    },
    {
      label: 'Email',
      href: `mailto:?subject=${encodedTitle}&body=${encodedBody}`,
      icon: IconMail,
    },
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?text=${encodedText}`,
      icon: IconBrandX,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80vh] gap-4 rounded-t-2xl p-4 duration-300 data-[side=bottom]:data-starting-style:translate-y-full data-[side=bottom]:data-ending-style:translate-y-full"
      >
        <div
          aria-hidden
          className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/30"
        />

        <SheetHeader className="p-0 text-left">
          <SheetTitle>Recipient not on XMTP yet</SheetTitle>
          <SheetDescription>
            {request.recipientName} hasn&apos;t opened an XMTP-enabled app, so the
            encrypted request can&apos;t be delivered. Share it through another channel
            instead.
          </SheetDescription>
        </SheetHeader>

        {canNativeShare && (
          <Button
            type="button"
            size="lg"
            onClick={handleNativeShare}
            className="h-12 w-full text-base"
          >
            <IconShare className="size-5" />
            Share via device
          </Button>
        )}

        <div className="grid grid-cols-4 gap-2">
          {targets.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-lg border bg-background py-3 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Icon className="size-6" />
              <span>{label}</span>
            </a>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
        >
          <span className="flex-1 truncate pr-3 font-mono text-xs text-muted-foreground">
            {request.url}
          </span>
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {copied ? (
              <>
                <IconCheck className="size-4" /> Copied
              </>
            ) : (
              <>
                <IconCopy className="size-4" /> Copy
              </>
            )}
          </span>
        </button>
      </SheetContent>
    </Sheet>
  );
}
