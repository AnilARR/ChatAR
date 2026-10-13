namespace ChatApi.Options;

/// <summary>Input limits enforced on every chat request. Bound from the "ChatLimits" config section.</summary>
public sealed class ChatLimitsOptions
{
    public const string SectionName = "ChatLimits";

    /// <summary>Maximum number of messages (conversation turns) accepted in one request.</summary>
    public int MaxMessages { get; set; } = 50;

    /// <summary>Maximum characters in a single message.</summary>
    public int MaxMessageLength { get; set; } = 20_000;

    /// <summary>Maximum characters across all messages in one request.</summary>
    public int MaxTotalLength { get; set; } = 200_000;

    /// <summary>Requests allowed per client IP per minute on the chat endpoints.</summary>
    public int RequestsPerMinute { get; set; } = 20;
}
