using ChatApi.Models;
using ChatApi.Services;
using Microsoft.AspNetCore.Http.Features;

namespace ChatApi.Endpoints;

/// <summary>Maps /api/health, /api/chat and /api/chat/stream.</summary>
public static class ChatEndpoints
{
    public const string RateLimitPolicy = "chat";

    public static IEndpointRouteBuilder MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }))
            .WithName("Health");

        var chat = api.MapGroup("/chat").RequireRateLimiting(RateLimitPolicy);

        chat.MapPost("/", CompleteAsync).WithName("Chat");
        chat.MapPost("/stream", StreamAsync).WithName("ChatStream");

        return app;
    }

    /// <summary>POST /api/chat — waits for the whole reply and returns { reply }.</summary>
    private static async Task<IResult> CompleteAsync(
        ChatRequest? request,
        ChatRequestValidator validator,
        IClaudeClient claude,
        HttpContext http)
    {
        var errors = validator.Validate(request);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var reply = await claude.CompleteAsync(request!.Messages!, request.Model, http.RequestAborted);
        return Results.Ok(new ChatResponse(reply));
    }

    /// <summary>
    /// POST /api/chat/stream — writes the reply as plain-text chunks, flushing each one immediately.
    /// If the browser aborts (Stop button), RequestAborted cancels the upstream Claude call.
    /// </summary>
    private static async Task StreamAsync(
        ChatRequest? request,
        ChatRequestValidator validator,
        IClaudeClient claude,
        HttpContext http,
        ILoggerFactory loggerFactory)
    {
        var errors = validator.Validate(request);
        if (errors.Count > 0)
        {
            await Results.ValidationProblem(errors).ExecuteAsync(http);
            return;
        }

        var logger = loggerFactory.CreateLogger(typeof(ChatEndpoints));
        var cancellationToken = http.RequestAborted;
        await using var pieces = claude
            .StreamAsync(request!.Messages!, request.Model, cancellationToken)
            .GetAsyncEnumerator(cancellationToken);

        try
        {
            // Pull the first piece before writing headers: if Claude returns an error (401, 429, 529...)
            // the global exception handler can still send a proper ProblemDetails response with that status.
            var hasFirst = await pieces.MoveNextAsync();

            http.Response.StatusCode = StatusCodes.Status200OK;
            http.Response.ContentType = "text/plain; charset=utf-8";
            http.Response.Headers.CacheControl = "no-cache";
            http.Response.Headers["X-Accel-Buffering"] = "no"; // disable proxy buffering (nginx)
            http.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
            await http.Response.StartAsync(cancellationToken);

            if (!hasFirst)
            {
                return;
            }

            do
            {
                await http.Response.WriteAsync(pieces.Current, cancellationToken);
                await http.Response.Body.FlushAsync(cancellationToken);
            }
            while (await pieces.MoveNextAsync());
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The user pressed "Stop" or closed the tab. Nothing to send back.
            logger.LogInformation("Chat stream cancelled by the client");
        }
        catch (Exception ex) when (http.Response.HasStarted)
        {
            // Headers are already sent, so the status code can no longer change; tell the user inline.
            logger.LogError(ex, "Chat stream failed after the response started");
            await http.Response.WriteAsync(
                "\n\n_[The response was interrupted by a server error. Please try again.]_", CancellationToken.None);
        }
    }
}
