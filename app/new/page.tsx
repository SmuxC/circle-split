import { IconAffiliate, IconChevronRight } from '@tabler/icons-react';
import Image from 'next/image';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export default function NewPage() {
  return (
    <div className="relative mx-auto flex max-w-4xl flex-col gap-4">
      {/* Mobile-only extension of the primary header bar; first card overlaps
          it by ~25% of its height.
          Math (after bumping the split bill card):
            - main has p-6 top → 24px gap between header bottom and card top.
            - Card height on mobile ≈ py-12 (96) + content (title 25 + gap 4 +
              ~3-line desc 60) ≈ 185px.
            - 25% of 185 ≈ 46px overlap.
            - Band must cover the 24px gap PLUS the 46px overlap ≈ 70px. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-6 h-[70px] bg-primary md:hidden"
      />

      {/* Main card — Split bill (sits on top of the bar extension).
          Card is taller (py-12) and reserves pr-44 for the image. Image is
          enlarged, mirrored horizontally, and pushed past the bottom-right
          corner with negative offsets so the card's overflow-hidden crops the
          right and bottom edges. */}
      <Card className="relative z-10 w-full cursor-pointer py-12 pl-6 pr-44 transition-colors hover:bg-accent/40">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg">Split bill</CardTitle>
          <CardDescription>
            Divide an expense between trusted Circles users.
          </CardDescription>
        </div>
        <Image
          src="/split-bill.png"
          alt=""
          width={450}
          height={450}
          className="pointer-events-none absolute -bottom-8 -right-8 size-48"
        />
      </Card>

      {/* Main card — Create payment request (same size/style as split bill). */}
      <Card className="relative w-full cursor-pointer py-12 pl-6 pr-44 transition-colors hover:bg-accent/40">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg">Create payment request</CardTitle>
          <CardDescription>
            Ask one or more people for a specific amount.
          </CardDescription>
        </div>
        <Image
          src="/invoice.png"
          alt=""
          width={450}
          height={450}
          className="pointer-events-none absolute -bottom-8 -right-8 size-48"
        />
      </Card>

      {/* Bar — Create group */}
      <Card className="flex w-full cursor-pointer flex-row items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
        <IconAffiliate className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Create group</span>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </div>
  );
}
