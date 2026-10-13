using System.Threading.RateLimiting;
using ChatApi.Endpoints;
using ChatApi.Infrastructure;
using ChatApi.Options;
using ChatApi.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// ---------- Configuration ----------
// The API key comes from user-secrets (Development), the Anthropic__ApiKey env var, or ANTHROPIC_API_KEY.
builder.Services
    .AddOptions<AnthropicOptions>()
    .Bind(builder.Configuration.GetSection(AnthropicOptions.SectionName))
    .PostConfigure(o =>
    {
        if (string.IsNullOrWhiteSpace(o.ApiKey))
        {
            o.ApiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY") ?? string.Empty;
        }

        if (!o.AllowedModels.Contains(o.Model, StringComparer.Ordinal))
        {
            o.AllowedModels.Insert(0, o.Model);
        }
    })
    .Validate(o => o.MaxTokens > 0, "Anthropic:MaxTokens must be positive.")
    .ValidateOnStart();

builder.Services
    .AddOptions<ChatLimitsOptions>()
    .Bind(builder.Configuration.GetSection(ChatLimitsOptions.SectionName))
    .Validate(o => o.MaxMessages > 0 && o.MaxMessageLength > 0 && o.RequestsPerMinute > 0, "ChatLimits values must be positive.")
    .ValidateOnStart();

// ---------- Services ----------
builder.Services.AddSingleton<ChatRequestValidator>();

builder.Services.AddHttpClient<IClaudeClient, ClaudeClient>((sp, client) =>
{
    var options = sp.GetRequiredService<IOptions<AnthropicOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
});

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// CORS: only the configured frontend origin(s) may call the API.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:4200"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(allowedOrigins)
    .WithMethods("GET", "POST")
    .WithHeaders("Content-Type")));

// Rate limiting: fixed window per client IP on the chat endpoints.
var requestsPerMinute = builder.Configuration.GetValue($"{ChatLimitsOptions.SectionName}:RequestsPerMinute", 20);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(ChatEndpoints.RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = requestsPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
    o.OnRejected = async (context, cancellationToken) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
        }

        await Results.Problem(
            title: "Too many requests",
            detail: $"You can send up to {requestsPerMinute} messages per minute. Please wait a moment.",
            statusCode: StatusCodes.Status429TooManyRequests).ExecuteAsync(context.HttpContext);
    };
});

var app = builder.Build();

// ---------- Pipeline ----------
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseRateLimiter();

app.MapChatEndpoints();

if (string.IsNullOrWhiteSpace(app.Services.GetRequiredService<IOptions<AnthropicOptions>>().Value.ApiKey))
{
    app.Logger.LogWarning("Anthropic API key is not configured. Chat requests will fail with 503 until it is set.");
}

app.Run();

/// <summary>Exposed so integration tests can use WebApplicationFactory&lt;Program&gt;.</summary>
public partial class Program;
