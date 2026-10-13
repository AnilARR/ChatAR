import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiMessage } from '../models/chat.models';

/** Error raised for failed API calls, carrying a message that is safe to show to the user. */
export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ChatApiError';
  }
}

export interface StreamOptions {
  model?: string;
  signal?: AbortSignal;
  /** Called with each text piece as it arrives. */
  onChunk: (text: string) => void;
}

/**
 * Talks to the ChatAR .NET API. Never calls Anthropic directly — the API key lives on the server.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * POST /chat/stream and feed each decoded text chunk to `onChunk`.
   * Resolves when the stream ends. Rejects with an AbortError when `signal` is aborted,
   * or with a {@link ChatApiError} for HTTP/network failures.
   */
  async streamChat(messages: ApiMessage[], options: StreamOptions): Promise<void> {
    const response = await this.post('/chat/stream', messages, options.model, options.signal);
    if (!response.body) {
      throw new ChatApiError('The server returned an empty response.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) options.onChunk(text);
      }
      const tail = decoder.decode();
      if (tail) options.onChunk(tail);
    } finally {
      reader.releaseLock();
    }
  }

  /** POST /chat and return the full reply (non-streaming fallback). */
  async sendChat(messages: ApiMessage[], model?: string, signal?: AbortSignal): Promise<string> {
    const response = await this.post('/chat', messages, model, signal);
    const body = (await response.json()) as { reply?: string };
    return body.reply ?? '';
  }

  /** GET /health — true when the API is reachable. */
  async isHealthy(signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async post(
    path: string,
    messages: ApiMessage[],
    model: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model }),
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      // fetch only rejects on network failures (server down, CORS, offline).
      throw new ChatApiError(
        "Can't reach the ChatAR server. Please check that the API is running and try again.",
      );
    }

    if (!response.ok) {
      throw new ChatApiError(await readErrorMessage(response), response.status);
    }
    return response;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Turns an error response (usually RFC 7807 ProblemDetails) into a friendly sentence. */
async function readErrorMessage(response: Response): Promise<string> {
  let detail: string | undefined;
  try {
    const problem = (await response.json()) as {
      detail?: string;
      title?: string;
      errors?: Record<string, string[]>;
    };
    const firstValidationError = problem.errors ? Object.values(problem.errors)[0]?.[0] : undefined;
    detail = firstValidationError ?? problem.detail ?? problem.title;
  } catch {
    // Body was not JSON; fall through to the status-based message.
  }

  switch (response.status) {
    case 429:
      return detail ?? 'Too many requests. Please wait a moment and try again.';
    case 503:
    case 529:
      return detail ?? 'Claude is temporarily unavailable. Please try again shortly.';
    default:
      return detail ?? `Something went wrong (HTTP ${response.status}). Please try again.`;
  }
}
