import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiMessage, ChatMessage, Conversation, Role } from '../models/chat.models';
import { ChatService, isAbortError } from './chat.service';

const STORAGE_KEY = 'chatar.conversations.v1';
const MODEL_KEY = 'chatar.model';
const TITLE_MAX_LENGTH = 48;

/**
 * Application state for chats, built on signals.
 * Owns the conversation list, the active conversation and the in-flight request,
 * and persists conversations to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly chat = inject(ChatService);

  private readonly _conversations = signal<Conversation[]>(loadConversations());
  private readonly _activeId = signal<string | null>(null);
  private readonly _isGenerating = signal(false);
  private readonly _model = signal<string>(loadModel());
  private abortController: AbortController | null = null;

  /** Conversations, most recently updated first. */
  readonly conversations = computed(() =>
    [...this._conversations()].sort((a, b) => b.updatedAt - a.updatedAt),
  );
  readonly activeId = this._activeId.asReadonly();
  readonly active = computed(
    () => this._conversations().find((c) => c.id === this._activeId()) ?? null,
  );
  readonly messages = computed(() => this.active()?.messages ?? []);
  readonly isGenerating = this._isGenerating.asReadonly();
  readonly model = this._model.asReadonly();

  /** Regenerate is offered when the last message is a finished assistant reply. */
  readonly canRegenerate = computed(() => {
    const last = this.messages().at(-1);
    return !this._isGenerating() && last?.role === 'assistant';
  });

  constructor() {
    // Persist whenever conversations change, but not on every streamed chunk:
    // while generating, the write happens once the reply finishes.
    effect(() => {
      const conversations = this._conversations();
      if (!this._isGenerating()) saveConversations(conversations);
    });
    effect(() => safeSetItem(MODEL_KEY, this._model()));
  }

  newChat(): void {
    this._activeId.set(null);
  }

  select(id: string): void {
    if (this._conversations().some((c) => c.id === id)) this._activeId.set(id);
  }

  setModel(model: string): void {
    if (environment.models.some((m) => m.id === model)) this._model.set(model);
  }

  rename(id: string, title: string): void {
    const trimmed = title.trim().slice(0, 100);
    if (!trimmed) return;
    this.updateConversation(id, (c) => ({ ...c, title: trimmed }), false);
  }

  delete(id: string): void {
    if (this._activeId() === id) {
      this.stop();
      this._activeId.set(null);
    }
    this._conversations.update((list) => list.filter((c) => c.id !== id));
  }

  /** Adds the user's message to the active chat (creating one if needed) and streams the reply. */
  async send(text: string): Promise<void> {
    const content = text.trim().slice(0, environment.maxMessageLength);
    if (!content || this._isGenerating()) return;

    let id = this._activeId();
    if (!id) {
      const now = Date.now();
      const conversation: Conversation = {
        id: createId(),
        title: makeTitle(content),
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      this._conversations.update((list) => [conversation, ...list]);
      this._activeId.set(conversation.id);
      id = conversation.id;
    }

    this.appendMessage(id, newMessage('user', content));
    await this.generate(id);
  }

  /** Removes the last assistant reply and asks Claude again. */
  async regenerate(): Promise<void> {
    const conversation = this.active();
    if (!conversation || !this.canRegenerate()) return;

    this.updateConversation(conversation.id, (c) => ({ ...c, messages: c.messages.slice(0, -1) }));
    await this.generate(conversation.id);
  }

  /** Stops the in-flight request; the partial answer is kept. */
  stop(): void {
    this.abortController?.abort();
  }

  /** Streams an assistant reply for the conversation's current history. */
  private async generate(conversationId: string): Promise<void> {
    const conversation = this._conversations().find((c) => c.id === conversationId);
    if (!conversation) return;

    const history = buildHistory(conversation.messages);
    const reply = newMessage('assistant', '', 'streaming');
    this.appendMessage(conversationId, reply);

    const controller = new AbortController();
    this.abortController = controller;
    this._isGenerating.set(true);

    try {
      await this.chat.streamChat(history, {
        model: this._model(),
        signal: controller.signal,
        onChunk: (chunk) =>
          this.patchMessage(conversationId, reply.id, (m) => ({ ...m, content: m.content + chunk })),
      });
      this.patchMessage(conversationId, reply.id, (m) => ({ ...m, status: 'done' }));
    } catch (error) {
      if (isAbortError(error)) {
        this.patchMessage(conversationId, reply.id, (m) => ({ ...m, status: 'stopped' }));
        this.removeIfEmpty(conversationId, reply.id);
      } else {
        const message =
          error instanceof Error ? error.message : 'Something went wrong. Please try again.';
        this.patchMessage(conversationId, reply.id, (m) => ({
          ...m,
          // Keep any partial text and show the error below it.
          content: m.content ? `${m.content}\n\n_${message}_` : message,
          status: 'error',
        }));
      }
    } finally {
      if (this.abortController === controller) this.abortController = null;
      this._isGenerating.set(false);
    }
  }

  private appendMessage(conversationId: string, message: ChatMessage): void {
    this.updateConversation(conversationId, (c) => ({ ...c, messages: [...c.messages, message] }));
  }

  private patchMessage(
    conversationId: string,
    messageId: string,
    patch: (m: ChatMessage) => ChatMessage,
  ): void {
    this.updateConversation(
      conversationId,
      (c) => ({ ...c, messages: c.messages.map((m) => (m.id === messageId ? patch(m) : m)) }),
      false,
    );
  }

  private removeIfEmpty(conversationId: string, messageId: string): void {
    this.updateConversation(
      conversationId,
      (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== messageId || m.content) }),
      false,
    );
  }

  private updateConversation(
    id: string,
    change: (c: Conversation) => Conversation,
    touch = true,
  ): void {
    this._conversations.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const next = change(c);
        return touch ? { ...next, updatedAt: Date.now() } : next;
      }),
    );
  }
}

/**
 * Messages sent to the API: finished, non-error turns only, capped to the most recent
 * `maxHistoryMessages`, and always starting with a user turn.
 */
export function buildHistory(messages: ChatMessage[]): ApiMessage[] {
  const usable = messages
    .filter((m) => m.status !== 'error' && m.content.trim())
    .map(({ role, content }) => ({ role, content }));
  let recent = usable.slice(-environment.maxHistoryMessages);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return recent;
}

/** Title from the first message: first line, collapsed whitespace, cut on a word boundary. */
export function makeTitle(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? text;
  const clean = line.replace(/\s+/g, ' ').trim();
  if (clean.length <= TITLE_MAX_LENGTH) return clean || 'New chat';
  const cut = clean.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function newMessage(role: Role, content: string, status: ChatMessage['status'] = 'done'): ChatMessage {
  return { id: createId(), role, content, status, createdAt: Date.now() };
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConversation).map((c) => ({
      ...c,
      // A reply that was streaming when the page closed can never finish.
      messages: c.messages
        .map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' as const } : m))
        .filter((m) => m.content),
    }));
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(conversations));
}

function loadModel(): string {
  try {
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved && environment.models.some((m) => m.id === saved)) return saved;
  } catch {
    // Storage unavailable (private mode, blocked cookies).
  }
  return environment.defaultModel;
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or storage disabled: chats simply won't persist.
  }
}

function isConversation(value: unknown): value is Conversation {
  const c = value as Conversation;
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    Array.isArray(c.messages) &&
    c.messages.every(
      (m) =>
        typeof m?.id === 'string' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
  );
}
