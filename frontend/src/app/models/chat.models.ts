export type Role = 'user' | 'assistant';

/** Lifecycle of an assistant message. User messages are always 'done'. */
export type MessageStatus = 'streaming' | 'done' | 'stopped' | 'error';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  status: MessageStatus;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** Message shape sent to the ChatAR API. */
export interface ApiMessage {
  role: Role;
  content: string;
}
