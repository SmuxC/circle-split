'use client';

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

export type ChatInfo = { name: string; backUrl: string };

export const ChatContext = createContext<{
  chat: ChatInfo | null;
  setChat: Dispatch<SetStateAction<ChatInfo | null>>;
}>({ chat: null, setChat: () => {} });

export function useChatContext() {
  return useContext(ChatContext);
}
