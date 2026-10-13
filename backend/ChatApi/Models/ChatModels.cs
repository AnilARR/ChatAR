namespace ChatApi.Models;

/// <summary>One turn of the conversation as sent by the frontend.</summary>
public sealed record ChatMessage(string Role, string Content);

/// <summary>Body of POST /api/chat and POST /api/chat/stream.</summary>
/// <param name="Messages">The full conversation so far, oldest first. The last message must be from the user.</param>
/// <param name="Model">Optional model id; must be one of Anthropic:AllowedModels.</param>
public sealed record ChatRequest(IReadOnlyList<ChatMessage>? Messages, string? Model = null);

/// <summary>Response of POST /api/chat.</summary>
public sealed record ChatResponse(string Reply);

public static class ChatRoles
{
    public const string User = "user";
    public const string Assistant = "assistant";
}
