'use client';

import { useEffect, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// 🛒 cart, 🤑 money face, 🍕 pizza, 🍹 drink, 💼 suitcase, 🥪 sandwich, 🫨 shaking face.
const QUICK_EMOJIS = ['🛒', '🤑', '🍕', '🍹', '💼', '🥪', '🫨'];

export function MessageCard({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setFocused(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [focused]);

  return (
    <>
      {/* Mobile-only blurred backdrop — desktop stays flat. */}
      <div
        aria-hidden
        onClick={() => setFocused(false)}
        className={cn(
          'fixed inset-0 z-[55] bg-foreground/40 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          focused ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div ref={wrapperRef} className={cn('relative', focused && 'z-[60]')}>
        <Card className="flex flex-col gap-3 p-4">
          <Input
            type="text"
            placeholder="Add a note"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            className="h-10 border-0 bg-transparent px-0 text-base focus-visible:ring-0"
          />
          <div className="flex gap-2">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Insert ${emoji}`}
                // Prevent the input from blurring when the emoji is tapped so
                // the mobile keyboard stays open and focus stays on the field.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(value + emoji)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl transition-colors hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
