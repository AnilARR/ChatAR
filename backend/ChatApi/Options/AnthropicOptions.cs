namespace ChatApi.Options;

/// <summary>
/// Settings for calling the Anthropic Messages API. Bound from the "Anthropic" config section.
/// The API key is never stored in appsettings.json: supply it through dotnet user-secrets
/// ("Anthropic:ApiKey"), the Anthropic__ApiKey environment variable, or ANTHROPIC_API_KEY.
/// </summary>
public sealed class AnthropicOptions
{
    public const string SectionName = "Anthropic";

    public string ApiKey { get; set; } = string.Empty;

    public string BaseUrl { get; set; } = "https://api.anthropic.com/";

    public string ApiVersion { get; set; } = "2023-06-01";

    /// <summary>Model used when the client does not request one.</summary>
    public string Model { get; set; } = "claude-sonnet-5-5";

    /// <summary>Models a client is allowed to pick from the model selector.</summary>
    public List<string> AllowedModels { get; set; } = ["claude-sonnet-5-5"];

    public int MaxTokens { get; set; } = 16000;

    /// <summary>Optional output_config.effort value (low | medium | high | xhigh | max). Empty = API default.</summary>
    public string Effort { get; set; } = string.Empty;

    public string SystemPrompt { get; set; } = string.Empty;

    /// <summary>
    /// Models for which the server-side refusal fallback ("fallbacks": "default") is requested.
    /// If a model's safety classifier declines, the API retries on Anthropic's recommended fallback.
    /// </summary>
    public List<string> ServerSideFallbackModels { get; set; } = [];

    public int TimeoutSeconds { get; set; } = 300;
}
