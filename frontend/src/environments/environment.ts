/**
 * The single place for frontend configuration.
 * The API key is NOT here: the browser only talks to the ChatAR .NET API, which holds the key.
 */
export const environment = {
  /** Base URL of the ChatAR .NET API (no trailing slash). */
  apiBaseUrl: 'http://localhost:5080/api',

  /** Models offered in the header dropdown. Must match Anthropic:AllowedModels on the server. */
  models: [
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', description: 'Smart and fast for everyday tasks' },
    { id: 'claude-opus-5-5', label: 'Opus 5.5', description: 'Most capable for complex work' },
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5', description: 'Fastest for quick answers' },
  ],
  defaultModel: 'claude-sonnet-5-5',

  /** Client-side limits; keep in line with the server's ChatLimits section. */
  maxMessageLength: 20_000,
  maxHistoryMessages: 50,
} as const;
