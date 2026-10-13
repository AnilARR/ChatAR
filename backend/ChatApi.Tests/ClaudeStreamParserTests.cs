using ChatApi.Services;

namespace ChatApi.Tests;

public class ClaudeStreamParserTests
{
    [Fact]
    public void Returns_text_from_text_delta()
    {
        const string line = """data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}""";

        Assert.Equal("Hello", ClaudeStreamParser.ParseLine(line));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("event: content_block_delta")]
    [InlineData("data: ")]
    [InlineData("""data: {"type":"ping"}""")]
    [InlineData("""data: {"type":"message_start","message":{"id":"msg_1"}}""")]
    [InlineData("""data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}""")]
    [InlineData("""data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}""")]
    [InlineData("data: {not json")]
    public void Ignores_lines_without_user_visible_text(string? line)
    {
        Assert.Null(ClaudeStreamParser.ParseLine(line));
    }

    [Fact]
    public void Adds_a_note_when_the_reply_hits_max_tokens()
    {
        const string line = """data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}""";

        Assert.Contains("truncated", ClaudeStreamParser.ParseLine(line));
    }

    [Fact]
    public void Adds_a_note_on_refusal()
    {
        const string line = """data: {"type":"message_delta","delta":{"stop_reason":"refusal"}}""";

        Assert.Contains("declined", ClaudeStreamParser.ParseLine(line));
    }

    [Fact]
    public void Reports_mid_stream_overload_errors()
    {
        const string line = """data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}""";

        Assert.Contains("overloaded", ClaudeStreamParser.ParseLine(line));
    }
}
