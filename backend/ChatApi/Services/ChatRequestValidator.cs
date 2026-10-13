using ChatApi.Models;
using ChatApi.Options;
using Microsoft.Extensions.Options;

namespace ChatApi.Services;

/// <summary>
/// Validates incoming chat requests before anything is sent to Claude.
/// Returns errors in the shape expected by <see cref="Results.ValidationProblem"/>.
/// </summary>
public sealed class ChatRequestValidator(IOptions<ChatLimitsOptions> limits, IOptions<AnthropicOptions> anthropic)
{
    private readonly ChatLimitsOptions _limits = limits.Value;
    private readonly AnthropicOptions _anthropic = anthropic.Value;

    public Dictionary<string, string[]> Validate(ChatRequest? request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request?.Messages is null || request.Messages.Count == 0)
        {
            errors["messages"] = ["At least one message is required."];
            return errors;
        }

        var messages = request.Messages;
        if (messages.Count > _limits.MaxMessages)
        {
            errors["messages"] = [$"A request may contain at most {_limits.MaxMessages} messages."];
            return errors;
        }

        var total = 0;
        for (var i = 0; i < messages.Count; i++)
        {
            var message = messages[i];
            var key = $"messages[{i}]";

            if (message is null)
            {
                errors[key] = ["Message must not be null."];
                continue;
            }

            if (message.Role is not (ChatRoles.User or ChatRoles.Assistant))
            {
                errors[$"{key}.role"] = ["Role must be 'user' or 'assistant'."];
            }

            if (string.IsNullOrWhiteSpace(message.Content))
            {
                errors[$"{key}.content"] = ["Content must not be empty."];
            }
            else if (message.Content.Length > _limits.MaxMessageLength)
            {
                errors[$"{key}.content"] = [$"Content must be at most {_limits.MaxMessageLength} characters."];
            }

            total += message.Content?.Length ?? 0;
        }

        if (total > _limits.MaxTotalLength)
        {
            errors["messages"] = [$"The conversation is too long ({total} characters, limit {_limits.MaxTotalLength}). Start a new chat."];
        }

        // Claude answers the final user turn; a trailing assistant message (prefill) is rejected by current models.
        if (messages[^1] is { Role: not ChatRoles.User })
        {
            errors["messages"] = ["The last message must have role 'user'."];
        }

        if (request.Model is { } model && !_anthropic.AllowedModels.Contains(model, StringComparer.Ordinal))
        {
            errors["model"] = [$"Model '{model}' is not allowed."];
        }

        return errors;
    }
}
