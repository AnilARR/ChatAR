using ChatApi.Models;
using ChatApi.Options;
using ChatApi.Services;

namespace ChatApi.Tests;

public class ChatRequestValidatorTests
{
    private static ChatRequestValidator CreateValidator(int maxMessages = 3, int maxLength = 10, int maxTotal = 25) =>
        new(
            Microsoft.Extensions.Options.Options.Create(new ChatLimitsOptions
            {
                MaxMessages = maxMessages,
                MaxMessageLength = maxLength,
                MaxTotalLength = maxTotal,
            }),
            Microsoft.Extensions.Options.Options.Create(new AnthropicOptions
            {
                AllowedModels = ["claude-sonnet-5-5", "claude-haiku-5-5"],
            }));

    private static ChatMessage User(string content) => new(ChatRoles.User, content);

    [Fact]
    public void Accepts_a_valid_conversation()
    {
        var request = new ChatRequest([User("hi"), new ChatMessage(ChatRoles.Assistant, "hello"), User("again")]);

        Assert.Empty(CreateValidator().Validate(request));
    }

    [Fact]
    public void Rejects_null_request() => Assert.Contains("messages", CreateValidator().Validate(null).Keys);

    [Fact]
    public void Rejects_empty_messages() => Assert.Contains("messages", CreateValidator().Validate(new ChatRequest([])).Keys);

    [Fact]
    public void Rejects_too_many_messages()
    {
        var request = new ChatRequest([User("a"), User("b"), User("c"), User("d")]);

        Assert.Contains("at most 3", CreateValidator().Validate(request)["messages"][0]);
    }

    [Fact]
    public void Rejects_unknown_role()
    {
        var request = new ChatRequest([new ChatMessage("system", "x"), User("hi")]);

        Assert.Contains("messages[0].role", CreateValidator().Validate(request).Keys);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("this message is too long")]
    public void Rejects_blank_or_too_long_content(string content)
    {
        Assert.Contains("messages[0].content", CreateValidator().Validate(new ChatRequest([User(content)])).Keys);
    }

    [Fact]
    public void Rejects_conversation_over_total_length()
    {
        var request = new ChatRequest([User("0123456789"), User("0123456789"), User("0123456789")]);

        Assert.Contains("too long", CreateValidator().Validate(request)["messages"][0]);
    }

    [Fact]
    public void Requires_last_message_from_user()
    {
        var request = new ChatRequest([User("hi"), new ChatMessage(ChatRoles.Assistant, "hello")]);

        Assert.Contains("last message", CreateValidator().Validate(request)["messages"][0]);
    }

    [Fact]
    public void Rejects_models_outside_the_allow_list()
    {
        Assert.Contains("model", CreateValidator().Validate(new ChatRequest([User("hi")], "gpt-4")).Keys);
        Assert.Empty(CreateValidator().Validate(new ChatRequest([User("hi")], "claude-haiku-5-5")));
    }
}
