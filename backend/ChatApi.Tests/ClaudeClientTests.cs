using System.Net;
using System.Text.Json;
using ChatApi.Models;
using ChatApi.Options;
using ChatApi.Services;
using ChatApi.Tests.TestDoubles;
using Microsoft.Extensions.Logging.Abstractions;

namespace ChatApi.Tests;

public class ClaudeClientTests
{
    private static readonly ChatMessage[] Conversation = [new(ChatRoles.User, "Hi there")];

    private static ClaudeClient CreateClient(StubHttpMessageHandler handler, Action<AnthropicOptions>? configure = null)
    {
        var options = new AnthropicOptions
        {
            ApiKey = "test-key",
            Model = "claude-sonnet-5-5",
            MaxTokens = 1234,
            SystemPrompt = "Be nice.",
            Effort = "low",
            ServerSideFallbackModels = ["claude-sonnet-5-5"],
        };
        configure?.Invoke(options);

        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.anthropic.com/") };
        return new ClaudeClient(http, Microsoft.Extensions.Options.Options.Create(options), NullLogger<ClaudeClient>.Instance);
    }

    [Fact]
    public async Task Complete_sends_expected_headers_and_body_and_returns_text()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK, """
            {"content":[{"type":"thinking","thinking":""},{"type":"text","text":"Hello "},{"type":"text","text":"back"}],"stop_reason":"end_turn"}
            """);

        var reply = await CreateClient(handler).CompleteAsync(Conversation, null, CancellationToken.None);

        Assert.Equal("Hello back", reply);

        var request = handler.LastRequest!;
        Assert.Equal("https://api.anthropic.com/v1/messages", request.RequestUri!.ToString());
        Assert.Equal("test-key", request.Headers.GetValues("x-api-key").Single());
        Assert.Equal("2023-06-01", request.Headers.GetValues("anthropic-version").Single());
        Assert.Equal("server-side-fallback-2026-07-01", request.Headers.GetValues("anthropic-beta").Single());

        using var body = JsonDocument.Parse(handler.LastRequestBody!);
        var root = body.RootElement;
        Assert.Equal("claude-sonnet-5-5", root.GetProperty("model").GetString());
        Assert.Equal(1234, root.GetProperty("max_tokens").GetInt32());
        Assert.Equal("Be nice.", root.GetProperty("system").GetString());
        Assert.Equal("low", root.GetProperty("output_config").GetProperty("effort").GetString());
        Assert.Equal("default", root.GetProperty("fallbacks").GetString());
        Assert.False(root.TryGetProperty("stream", out _));
        Assert.Equal("Hi there", root.GetProperty("messages")[0].GetProperty("content").GetString());
    }

    [Fact]
    public async Task Requested_model_without_fallback_support_omits_fallback_fields()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK, """{"content":[{"type":"text","text":"ok"}]}""");

        await CreateClient(handler).CompleteAsync(Conversation, "claude-haiku-5-5", CancellationToken.None);

        Assert.False(handler.LastRequest!.Headers.Contains("anthropic-beta"));
        using var body = JsonDocument.Parse(handler.LastRequestBody!);
        Assert.Equal("claude-haiku-5-5", body.RootElement.GetProperty("model").GetString());
        Assert.False(body.RootElement.TryGetProperty("fallbacks", out _));
    }

    [Fact]
    public async Task Stream_yields_text_deltas_in_order()
    {
        const string sse = """
            event: message_start
            data: {"type":"message_start","message":{"id":"msg_1"}}

            event: content_block_delta
            data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}

            event: ping
            data: {"type":"ping"}

            event: content_block_delta
            data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo!"}}

            event: message_delta
            data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}

            event: message_stop
            data: {"type":"message_stop"}

            """;
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK, sse, "text/event-stream");

        var pieces = new List<string>();
        await foreach (var piece in CreateClient(handler).StreamAsync(Conversation, null, CancellationToken.None))
        {
            pieces.Add(piece);
        }

        Assert.Equal(["Hel", "lo!"], pieces);
        Assert.Contains("\"stream\":true", handler.LastRequestBody);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests, "rate_limit_error")]
    [InlineData(HttpStatusCode.Unauthorized, "authentication_error")]
    [InlineData((HttpStatusCode)529, "overloaded_error")]
    public async Task Upstream_errors_keep_their_status_code(HttpStatusCode status, string errorType)
    {
        var handler = new StubHttpMessageHandler(status, $$$"""{"type":"error","error":{"type":"{{{errorType}}}","message":"nope"}}""");
        var client = CreateClient(handler);

        var ex = await Assert.ThrowsAsync<ClaudeApiException>(() => client.CompleteAsync(Conversation, null, CancellationToken.None));
        Assert.Equal((int)status, ex.StatusCode);
        Assert.Equal(errorType, ex.ErrorType);

        var streamEx = await Assert.ThrowsAsync<ClaudeApiException>(async () =>
        {
            await foreach (var _ in client.StreamAsync(Conversation, null, CancellationToken.None))
            {
            }
        });
        Assert.Equal((int)status, streamEx.StatusCode);
    }

    [Fact]
    public async Task Missing_api_key_fails_with_503_without_calling_anthropic()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK, "{}");
        var client = CreateClient(handler, o => o.ApiKey = "");

        var ex = await Assert.ThrowsAsync<ClaudeApiException>(() => client.CompleteAsync(Conversation, null, CancellationToken.None));

        Assert.Equal(503, ex.StatusCode);
        Assert.Null(handler.LastRequest);
    }

    [Fact]
    public async Task Cancellation_is_propagated()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK, "{}");
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateClient(handler).CompleteAsync(Conversation, null, cts.Token));
    }
}
