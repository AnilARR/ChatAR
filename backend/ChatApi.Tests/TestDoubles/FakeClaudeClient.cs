using System.Runtime.CompilerServices;
using ChatApi.Models;
using ChatApi.Services;

namespace ChatApi.Tests.TestDoubles;

/// <summary>In-memory <see cref="IClaudeClient"/> used by the endpoint tests.</summary>
internal sealed class FakeClaudeClient : IClaudeClient
{
    public string[] Pieces { get; set; } = ["Hello", ", ", "world!"];

    public Exception? Error { get; set; }

    public IReadOnlyList<ChatMessage>? LastMessages { get; private set; }

    public string? LastModel { get; private set; }

    public Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, string? model, CancellationToken cancellationToken)
    {
        LastMessages = messages;
        LastModel = model;
        return Error is null ? Task.FromResult(string.Concat(Pieces)) : Task.FromException<string>(Error);
    }

    public async IAsyncEnumerable<string> StreamAsync(
        IReadOnlyList<ChatMessage> messages, string? model, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        LastMessages = messages;
        LastModel = model;
        await Task.Yield();
        if (Error is not null)
        {
            throw Error;
        }

        foreach (var piece in Pieces)
        {
            cancellationToken.ThrowIfCancellationRequested();
            yield return piece;
        }
    }
}
