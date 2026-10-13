import { TestBed } from '@angular/core/testing';
import { ChatMessage } from '../models/chat.models';
import { ChatApiError, ChatService, StreamOptions } from './chat.service';
import { buildHistory, ChatStore, makeTitle } from './chat.store';

/** Fake ChatService whose stream is driven by the test. */
class FakeChatService {
  calls: { messages: unknown[]; options: StreamOptions }[] = [];
  behaviour: (options: StreamOptions) => Promise<void> = async (o) => {
    o.onChunk('Hi ');
    o.onChunk('there');
  };

  streamChat(messages: unknown[], options: StreamOptions): Promise<void> {
    this.calls.push({ messages, options });
    return this.behaviour(options);
  }
}

describe('ChatStore', () => {
  let store: ChatStore;
  let fake: FakeChatService;

  beforeEach(() => {
    localStorage.clear();
    fake = new FakeChatService();
    TestBed.configureTestingModule({ providers: [{ provide: ChatService, useValue: fake }] });
    store = TestBed.inject(ChatStore);
  });

  it('creates a conversation titled from the first message and streams the reply', async () => {
    await store.send('  What is Angular?  ');

    expect(store.conversations().length).toBe(1);
    expect(store.active()?.title).toBe('What is Angular?');
    const [user, reply] = store.messages();
    expect(user).toMatchObject({ role: 'user', content: 'What is Angular?' });
    expect(reply).toMatchObject({ role: 'assistant', content: 'Hi there', status: 'done' });
    expect(fake.calls[0].messages).toEqual([{ role: 'user', content: 'What is Angular?' }]);
    expect(store.isGenerating()).toBe(false);
  });

  it('ignores blank messages', async () => {
    await store.send('   ');
    expect(store.conversations().length).toBe(0);
    expect(fake.calls.length).toBe(0);
  });

  it('keeps partial text and marks the reply stopped when aborted', async () => {
    fake.behaviour = (o) =>
      new Promise((_, reject) => {
        o.onChunk('Partial');
        o.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });

    const pending = store.send('Tell me a story');
    expect(store.isGenerating()).toBe(true);
    store.stop();
    await pending;

    expect(store.messages().at(-1)).toMatchObject({ content: 'Partial', status: 'stopped' });
    expect(store.isGenerating()).toBe(false);
  });

  it('removes an empty reply when stopped before the first token', async () => {
    fake.behaviour = (o) =>
      new Promise((_, reject) =>
        o.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );

    const pending = store.send('Hello');
    store.stop();
    await pending;

    expect(store.messages().map((m) => m.role)).toEqual(['user']);
  });

  it('shows a friendly error message when the API fails', async () => {
    fake.behaviour = () => Promise.reject(new ChatApiError("Can't reach the ChatAR server.", undefined));

    await store.send('Hello');

    expect(store.messages().at(-1)).toMatchObject({ status: 'error', content: "Can't reach the ChatAR server." });
    expect(store.canRegenerate()).toBe(true);
  });

  it('regenerates the last reply without resending it as history', async () => {
    await store.send('Hello');
    fake.behaviour = async (o) => o.onChunk('Second answer');

    await store.regenerate();

    expect(store.messages().length).toBe(2);
    expect(store.messages().at(-1)?.content).toBe('Second answer');
    expect(fake.calls[1].messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('persists conversations to localStorage and restores them', async () => {
    await store.send('Remember me');
    TestBed.tick();

    const saved = JSON.parse(localStorage.getItem('chatar.conversations.v1') ?? '[]');
    expect(saved[0].title).toBe('Remember me');
  });

  it('renames and deletes conversations', async () => {
    await store.send('Original');
    const id = store.activeId()!;

    store.rename(id, '  Renamed  ');
    expect(store.active()?.title).toBe('Renamed');

    store.delete(id);
    expect(store.conversations().length).toBe(0);
    expect(store.activeId()).toBeNull();
  });

  it('only accepts configured models', () => {
    store.setModel('claude-haiku-5-5');
    expect(store.model()).toBe('claude-haiku-5-5');
    store.setModel('not-a-model');
    expect(store.model()).toBe('claude-haiku-5-5');
  });
});

describe('buildHistory', () => {
  const msg = (role: 'user' | 'assistant', content: string, status: ChatMessage['status'] = 'done'): ChatMessage => ({
    id: Math.random().toString(),
    role,
    content,
    status,
    createdAt: 0,
  });

  it('drops error replies and empty messages', () => {
    const history = buildHistory([msg('user', 'a'), msg('assistant', 'boom', 'error'), msg('user', 'b'), msg('assistant', '')]);
    expect(history).toEqual([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ]);
  });

  it('never starts with an assistant turn after trimming', () => {
    const many = Array.from({ length: 60 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`));
    const history = buildHistory([...many, msg('user', 'last')]);
    expect(history[0].role).toBe('user');
    expect(history.length).toBeLessThanOrEqual(50);
    expect(history.at(-1)?.content).toBe('last');
  });
});

describe('makeTitle', () => {
  it('uses the first non-empty line', () => expect(makeTitle('\n\nHello there\nmore')).toBe('Hello there'));

  it('truncates long text on a word boundary', () => {
    const title = makeTitle('Explain the difference between processes and threads in operating systems please');
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49);
  });
});
