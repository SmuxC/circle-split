'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

import { IconSearch } from '@tabler/icons-react';

import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { GIFS, GIF_CATEGORIES, type GifEntry } from '@/lib/gifs.generated';

const ALL = '__all__';

export function GifDrawer({
  trigger,
  onSelect,
}: {
  trigger: React.ReactNode;
  onSelect: (gif: GifEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GIFS.filter((g) => {
      if (category !== ALL && g.category !== category) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.category.includes(q)) {
        return false;
      }
      return true;
    });
  }, [query, category]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80vh] gap-3 rounded-t-2xl p-4 duration-300 data-[side=bottom]:data-starting-style:translate-y-full data-[side=bottom]:data-ending-style:translate-y-full"
      >
        <div
          aria-hidden
          className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/30"
        />

        <SheetHeader className="p-0">
          <SheetTitle>Pick a GIF</SheetTitle>
        </SheetHeader>

        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs"
            className="h-10 pl-9"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <CategoryPill
            label="All"
            active={category === ALL}
            onClick={() => setCategory(ALL)}
          />
          {GIF_CATEGORIES.map((c) => (
            <CategoryPill
              key={c}
              label={c}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {filtered.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onSelect(g);
                setOpen(false);
              }}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-80"
              aria-label={g.name}
            >
              <Image
                src={g.src}
                alt={g.name}
                fill
                sizes="(min-width: 640px) 25vw, 33vw"
                className="object-cover"
                unoptimized
              />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No GIFs match.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}
