'use client';

import { useState } from 'react';

import { IconCamera, IconGif, IconPhoto, type Icon as TablerIcon } from '@tabler/icons-react';

import { useNewMode } from '@/components/new/new-mode';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FromCombobox } from '@/components/wallet/FromCombobox';
import { MessageCard } from '@/components/wallet/MessageCard';
import { TOKENS, TokenDrawer, type Token } from '@/components/wallet/TokenDrawer';

const ATTACHMENTS: { icon: TablerIcon; label: string }[] = [
  { icon: IconGif, label: 'GIF' },
  { icon: IconPhoto, label: 'Photo' },
  { icon: IconCamera, label: 'Take photo' },
];

export default function NewPage() {
  const { mode } = useNewMode();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<Token>(TOKENS[0]);

  if (mode === 'split') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="text-base font-medium text-muted-foreground">Soon</span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
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

      {/* Attachments — own section, 3 equal columns, no separators. */}
      <div className="flex">
        {ATTACHMENTS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            className="flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Icon className="size-6 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Submit. */}
      <Button type="button" size="lg" className="h-14 w-full text-base">
        Request {token.symbol}
      </Button>
    </div>
  );
}
