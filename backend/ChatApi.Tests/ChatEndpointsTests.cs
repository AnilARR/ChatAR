using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChatApi.Services;
using ChatApi.Tests.TestDoubles;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ChatApi.Tests;

public class ChatEndpointsTests
{
    private static readonly object ValidBody = new { messages = new[] { new { role = "user", content = "Hi" } } };

    private static (WebApplicationFactory<Program> Factory, FakeClaudeClient Claude) CreateApp(int requestsPerMinute = 100)
    {
        var claude = new FakeClaudeClient();
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ChatLimits:RequestsPerMinute", requestsPerMinute.ToString());
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IClaudeClient>();
                services.AddSingleton<IClaudeClient>(claude);
            });
        });
        return (factory, claude);
    }

    [Fact]
    public async Task Health_returns_ok()
    {
        var (factory, _) = CreateApp();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/chat")]
    [InlineData("/api/chat/stream")]
    public async Task Empty_messages_return_400_problem_details(string url)
    {
        var (factory, _) = CreateApp();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(url, new { messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Chat_returns_full_reply_as_json()
    {
        var (factory, claude) = CreateApp();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/chat", ValidBody);

        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Hello, world!", json.RootElement.GetProperty("reply").GetString());
        Assert.Equal("Hi", claude.LastMessages![0].Content);
    }

    [Fact]
    public async Task Stream_returns_plain_text_chunks()
    {
        var (factory, _) = CreateApp();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/chat/stream", ValidBody);

        response.EnsureSuccessStatusCode();
        Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Hello, world!", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/api/chat")]
    [InlineData("/api/chat/stream")]
    public async Task Claude_errors_pass_their_status_code_through(string url)
    {
        var (factory, claude) = CreateApp();
        claude.Error = new ClaudeApiException(529, "Claude is temporarily overloaded.", "overloaded_error");
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(url, ValidBody);

        Assert.Equal((HttpStatusCode)529, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("overloaded", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unexpected_errors_return_generic_500_problem_details()
    {
        var (factory, claude) = CreateApp();
        claude.Error = new InvalidOperationException("secret internal detail");
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/chat", ValidBody);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.DoesNotContain("secret internal detail", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Rate_limit_returns_429_after_the_limit()
    {
        var (factory, _) = CreateApp(requestsPerMinute: 2);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/chat", ValidBody)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/chat", ValidBody)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/chat", ValidBody)).StatusCode);
    }

    [Fact]
    public async Task Cors_allows_only_the_configured_origin()
    {
        var (factory, _) = CreateApp();
        using var client = factory.CreateClient();

        async Task<bool> IsAllowed(string origin)
        {
            using var request = new HttpRequestMessage(HttpMethod.Options, "/api/chat/stream");
            request.Headers.Add("Origin", origin);
            request.Headers.Add("Access-Control-Request-Method", "POST");
            request.Headers.Add("Access-Control-Request-Headers", "content-type");
            var response = await client.SendAsync(request);
            return response.Headers.Contains("Access-Control-Allow-Origin");
        }

        Assert.True(await IsAllowed("http://localhost:4200"));
        Assert.False(await IsAllowed("https://evil.example"));
    }
}
