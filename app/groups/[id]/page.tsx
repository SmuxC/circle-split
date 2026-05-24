'use client';

import { use } from 'react';

import { DmView } from '@/components/dms/DmView';

export default function GroupChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DmView conversationId={id} />;
}
