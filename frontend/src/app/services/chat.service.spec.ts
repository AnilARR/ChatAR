import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ChatApiError, ChatService } from './chat.service';

/** Builds a fetch Response whose body streams the given chunks. */
function streamingResponse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, init);
}

function problem(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

describe('ChatService', () => {
  let service: ChatService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const messages = [{ role: 'user' as const, content: 'Hello' }];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatService);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => vi.restoreAllMocks());

  it('streams chunks to the callback in order', async () => {
    fetchSpy.mockResolvedValue(streamingResponse(['Hel', 'lo ', 'world']));
    const received: string[] = [];

    await service.streamChat(messages, { model: 'claude-sonnet-5-5', onChunk: (t) => received.push(t) });

    expect(received.join('')).toBe('Hello world');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${environment.apiBaseUrl}/chat/stream`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ messages, model: 'claude-sonnet-5-5' });
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('héllo 👋');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2)); // splits "é"
        controller.enqueue(bytes.slice(2, 9)); // splits the emoji
        controller.enqueue(bytes.slice(9));
        controller.close();
      },
    });
    fetchSpy.mockResolvedValue(new Response(body));
    let text = '';

    await service.streamChat(messages, { onChunk: (t) => (text += t) });

    expect(text).toBe('héllo 👋');
  });

  it('returns the full reply from the non-streaming endpoint', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ reply: 'Hi!' }), { status: 200 }));

    await expect(service.sendChat(messages)).resolves.toBe('Hi!');
    expect(fetchSpy.mock.calls[0][0]).toBe(`${environment.apiBaseUrl}/chat`);
  });

  it('turns a network failure into a friendly error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await service.streamChat(messages, { onChunk: () => {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChatApiError);
    expect((error as ChatApiError).message).toContain("Can't reach the ChatAR server");
  });

  it('uses the ProblemDetails detail and keeps the status code', async () => {
    fetchSpy.mockResolvedValue(problem(529, { title: 'Claude is unavailable', detail: 'Claude is temporarily overloaded.' }));

    const error = (await service.streamChat(messages, { onChunk: () => {} }).catch((e: unknown) => e)) as ChatApiError;

    expect(error.status).toBe(529);
    expect(error.message).toBe('Claude is temporarily overloaded.');
  });

  it('surfaces the first validation error for 400 responses', async () => {
    fetchSpy.mockResolvedValue(problem(400, { title: 'Validation', errors: { messages: ['At least one message is required.'] } }));

    const error = (await service.sendChat([]).catch((e: unknown) => e)) as ChatApiError;

    expect(error.status).toBe(400);
    expect(error.message).toBe('At least one message is required.');
  });

  it('falls back to a status-based message when the body is not JSON', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>Too many</html>', { status: 429 }));

    const error = (await service.sendChat(messages).catch((e: unknown) => e)) as ChatApiError;

    expect(error.message).toMatch(/Too many requests/);
  });

  it('rethrows AbortError so callers can tell "stopped" from "failed"', async () => {
    fetchSpy.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const error = await service.streamChat(messages, { onChunk: () => {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });

  it('reports API health', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(service.isHealthy()).resolves.toBe(true);

    fetchSpy.mockRejectedValueOnce(new TypeError('down'));
    await expect(service.isHealthy()).resolves.toBe(false);
  });
});
