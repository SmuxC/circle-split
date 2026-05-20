'use client';

import { IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';
import { use } from 'react';

import { TripView } from '@/components/trips/TripView';

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/groups"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" />
        Trips
      </Link>
      <TripView conversationId={id} />
    </div>
  );
}
