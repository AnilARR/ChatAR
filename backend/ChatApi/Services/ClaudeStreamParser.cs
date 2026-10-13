using System.Text.Json;

namespace ChatApi.Services;

/// <summary>
/// Turns individual Server-Sent-Event lines from the Messages API into text for the user.
/// Kept free of I/O so it can be unit-tested line by line.
/// </summary>
/// <remarks>
/// Relevant events:
/// <code>
/// data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
/// data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},...}
/// data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}
/// </code>
/// Thinking deltas, pings and block start/stop events are ignored.
/// </remarks>
public static class ClaudeStreamParser
{
    private const string DataPrefix = "data:";

    /// <summary>
    /// Returns the text to forward to the client for one SSE line, or null when the line carries no user-visible text.
    /// </summary>
    public static string? ParseLine(string? line)
    {
        if (string.IsNullOrEmpty(line) || !line.StartsWith(DataPrefix, StringComparison.Ordinal))
        {
            return null;
        }

        var json = line.AsSpan(DataPrefix.Length).Trim();
        if (json.IsEmpty)
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(json.ToString());
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;

            return type switch
            {
                "content_block_delta" => ReadTextDelta(root),
                "message_delta" => DescribeStopReason(ReadStopReason(root)),
                "error" => DescribeStreamError(root),
                _ => null,
            };
        }
        catch (JsonException)
        {
            // A malformed line should not kill the whole answer.
            return null;
        }
    }

    /// <summary>A short note appended to the answer for stop reasons the user should know about.</summary>
    public static string? DescribeStopReason(string? stopReason) => stopReason switch
    {
        "max_tokens" => "\n\n_[Response truncated: the maximum length was reached.]_",
        "refusal" => "\n\n_[The assistant declined to continue this request.]_",
        _ => null,
    };

    private static string? ReadTextDelta(JsonElement root)
    {
        if (root.TryGetProperty("delta", out var delta)
            && delta.TryGetProperty("type", out var deltaType)
            && deltaType.GetString() == "text_delta"
            && delta.TryGetProperty("text", out var text))
        {
            return text.GetString();
        }

        return null;
    }

    private static string? ReadStopReason(JsonElement root) =>
        root.TryGetProperty("delta", out var delta)
        && delta.TryGetProperty("stop_reason", out var reason)
        && reason.ValueKind == JsonValueKind.String
            ? reason.GetString()
            : null;

    private static string DescribeStreamError(JsonElement root)
    {
        var errorType = root.TryGetProperty("error", out var error) && error.TryGetProperty("type", out var et)
            ? et.GetString()
            : null;

        return errorType == "overloaded_error"
            ? "\n\n_[The response was interrupted because Claude is overloaded. Please try again.]_"
            : "\n\n_[The response was interrupted by an upstream error. Please try again.]_";
    }
}
