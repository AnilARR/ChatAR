using System.Net;
using System.Text;

namespace ChatApi.Tests.TestDoubles;

/// <summary>Returns a canned response and records the outgoing request for assertions.</summary>
internal sealed class StubHttpMessageHandler(HttpStatusCode status, string body, string mediaType = "application/json")
    : HttpMessageHandler
{
    public HttpRequestMessage? LastRequest { get; private set; }

    public string? LastRequestBody { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        LastRequest = request;
        LastRequestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, mediaType) };
    }
}
