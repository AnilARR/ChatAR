using ChatApi.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Infrastructure;

/// <summary>
/// Converts unhandled exceptions into RFC 7807 ProblemDetails responses.
/// Claude API errors keep their upstream status code; anything else becomes a generic 500
/// so internal details never leak to the browser.
/// </summary>
public sealed class GlobalExceptionHandler(IProblemDetailsService problemDetails, ILogger<GlobalExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && http.RequestAborted.IsCancellationRequested)
        {
            // Client went away; there is nobody to answer. 499 is the conventional "client closed request" code.
            http.Response.StatusCode = 499;
            return true;
        }

        if (http.Response.HasStarted)
        {
            logger.LogError(exception, "Unhandled exception after the response started");
            return true;
        }

        ProblemDetails problem;
        if (exception is ClaudeApiException claude)
        {
            problem = new ProblemDetails
            {
                Status = claude.StatusCode,
                Title = claude.StatusCode switch
                {
                    429 => "Too many requests",
                    >= 500 => "Claude is unavailable",
                    _ => "Claude request failed",
                },
                Detail = claude.Message,
            };
            if (claude.ErrorType is not null)
            {
                problem.Extensions["errorType"] = claude.ErrorType;
            }
        }
        else if (exception is BadHttpRequestException bad)
        {
            // Malformed JSON body, wrong content type, etc.
            problem = new ProblemDetails { Status = bad.StatusCode, Title = "Invalid request", Detail = "The request body is invalid." };
        }
        else
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", http.Request.Method, http.Request.Path);
            problem = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Unexpected server error",
                Detail = "Something went wrong on the server. Please try again.",
            };
        }

        http.Response.StatusCode = problem.Status!.Value;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
