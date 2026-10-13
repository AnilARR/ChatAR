using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ChatApi.Models;
using ChatApi.Options;
using Microsoft.Extensions.Options;

namespace ChatApi.Services;

/// <summary>Abstraction over the Anthropic Messages API so endpoints can be tested without network access.</summary>
public interface IClaudeClient
{
    /// <summary>Sends the conversation and returns Claude's complete text reply.</summary>
    Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, string? model, CancellationToken cancellationToken);

    /// <summary>
    /// Sends the conversation with "stream": true and yields text pieces as they arrive.
    /// The HTTP call starts on the first MoveNextAsync, so API errors surface before any text is yielded.
    /// </summary>
    IAsyncEnumerable<string> StreamAsync(IReadOnlyList<ChatMessage> messages, string? model, CancellationToken cancellationToken);
}

/// <summary>Calls POST /v1/messages with a typed <see cref="HttpClient"/> provided by IHttpClientFactory.</summary>
public sealed class ClaudeClient(HttpClient httpClient, IOptions<AnthropicOptions> options, ILogger<ClaudeClient> logger)
    : IClaudeClient
{
    private const string MessagesPath = "v1/messages";
    private const string FallbackBetaHeader = "server-side-fallback-2026-07-01";

    private readonly AnthropicOptions _options = options.Value;

    public async Task<string> CompleteAsync(
        IReadOnlyList<ChatMessage> messages, string? model, CancellationToken cancellationToken)
    {
        var resolvedModel = ResolveModel(model);
        using var request = BuildRequest(messages, resolvedModel, stream: false);
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);

        await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(body, cancellationToken: cancellationToken);
        var root = doc.RootElement;

        // Concatenate every text block; thinking blocks and others are not shown to the user.
        var reply = new StringBuilder();
        if (root.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in content.EnumerateArray())
            {
                if (block.TryGetProperty("type", out var type) && type.GetString() == "text"
                    && block.TryGetProperty("text", out var text))
                {
                    reply.Append(text.GetString());
                }
            }
        }

        var stopReason = root.TryGetProperty("stop_reason", out var sr) && sr.ValueKind == JsonValueKind.String
            ? sr.GetString()
            : null;
        reply.Append(ClaudeStreamParser.DescribeStopReason(stopReason));

        logger.LogInformation("Claude reply completed (model {Model}, stop reason {StopReason}, {Length} chars)",
            resolvedModel, stopReason, reply.Length);
        return reply.ToString();
    }

    public async IAsyncEnumerable<string> StreamAsync(
        IReadOnlyList<ChatMessage> messages,
        string? model,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var resolvedModel = ResolveModel(model);
        using var request = BuildRequest(messages, resolvedModel, stream: true);

        // ResponseHeadersRead returns as soon as headers arrive so we can read the body incrementally.
        // Cancelling the token (client pressed "Stop") aborts the upstream request to Anthropic.
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);

        await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(body, Encoding.UTF8);

        var pieces = 0;
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            var text = ClaudeStreamParser.ParseLine(line);
            if (!string.IsNullOrEmpty(text))
            {
                pieces++;
                yield return text;
            }
        }

        logger.LogInformation("Claude stream completed (model {Model}, {Pieces} pieces)", resolvedModel, pieces);
    }

    /// <summary>Builds the JSON body and headers for a Messages API request.</summary>
    internal HttpRequestMessage BuildRequest(IReadOnlyList<ChatMessage> messages, string model, bool stream)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            // 503: the server is misconfigured, not the client's fault.
            throw new ClaudeApiException(StatusCodes.Status503ServiceUnavailable,
                "The Anthropic API key is not configured on the server. See README: 'Set the API key'.",
                "configuration_error");
        }

        var body = new JsonObject
        {
            ["model"] = model,
            ["max_tokens"] = _options.MaxTokens,
            ["messages"] = new JsonArray(messages
                .Select(m => (JsonNode)new JsonObject { ["role"] = m.Role, ["content"] = m.Content })
                .ToArray()),
        };

        if (!string.IsNullOrWhiteSpace(_options.SystemPrompt))
        {
            body["system"] = _options.SystemPrompt;
        }

        if (!string.IsNullOrWhiteSpace(_options.Effort))
        {
            body["output_config"] = new JsonObject { ["effort"] = _options.Effort };
        }

        if (stream)
        {
            body["stream"] = true;
        }

        // If a safety classifier declines, let the API retry on Anthropic's recommended fallback model.
        var useFallback = _options.ServerSideFallbackModels.Contains(model, StringComparer.Ordinal);
        if (useFallback)
        {
            body["fallbacks"] = "default";
        }

        var request = new HttpRequestMessage(HttpMethod.Post, MessagesPath)
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("x-api-key", _options.ApiKey);
        request.Headers.Add("anthropic-version", _options.ApiVersion);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(stream ? "text/event-stream" : "application/json"));

        if (useFallback)
        {
            request.Headers.Add("anthropic-beta", FallbackBetaHeader);
        }

        return request;
    }

    private string ResolveModel(string? requested) =>
        string.IsNullOrWhiteSpace(requested) ? _options.Model : requested;

    /// <summary>Converts an Anthropic error response into a <see cref="ClaudeApiException"/> with the same status code.</summary>
    private async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var status = (int)response.StatusCode;
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        string? errorType = null;
        string? message = null;

        // Anthropic errors look like {"type":"error","error":{"type":"rate_limit_error","message":"..."}}
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("error", out var error))
            {
                errorType = error.TryGetProperty("type", out var t) ? t.GetString() : null;
                message = error.TryGetProperty("message", out var m) ? m.GetString() : null;
            }
        }
        catch (JsonException)
        {
            // Non-JSON body (e.g. from a proxy); fall back to a generic message.
        }

        logger.LogWarning("Anthropic API returned {Status} ({ErrorType}): {Message}", status, errorType, message ?? raw);

        var friendly = status switch
        {
            401 or 403 => "The server's Anthropic API key was rejected. Check the key configuration.",
            429 => "Claude is receiving too many requests right now. Please wait a moment and try again.",
            529 => "Claude is temporarily overloaded. Please try again shortly.",
            _ => message ?? $"The Anthropic API returned status {status}.",
        };

        throw new ClaudeApiException(status, friendly, errorType);
    }
}
