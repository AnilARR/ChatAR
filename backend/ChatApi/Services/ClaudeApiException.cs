namespace ChatApi.Services;

/// <summary>
/// An error returned by (or about) the Anthropic API. <see cref="StatusCode"/> is passed through
/// to the frontend so it can, for example, distinguish rate limiting (429) from an outage (5xx).
/// </summary>
public sealed class ClaudeApiException(int statusCode, string message, string? errorType = null)
    : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    /// <summary>Anthropic error type such as "rate_limit_error" or "overloaded_error", when known.</summary>
    public string? ErrorType { get; } = errorType;
}
