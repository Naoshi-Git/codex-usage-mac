using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;

namespace CodexUsageMac;

internal sealed class CodexClient
{
    internal const long FiveHourMinutes = 300;
    internal const long WeeklyMinutes = 10_080;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);

    internal async Task<UsageSnapshot> FetchAsync(CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsMacOS())
            throw new PlatformNotSupportedException("codex-usage-mac supports macOS only.");

        using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);

        ProcessStartInfo startInfo = CreateStartInfo();
        using Process process = new() { StartInfo = startInfo };
        Task<string>? stderrTask = null;

        try
        {
            if (!process.Start())
                throw new InvalidOperationException("Could not start Codex CLI.");

            stderrTask = process.StandardError.ReadToEndAsync(timeout.Token);

            await SendAsync(process.StandardInput,
                """
                {"id":1,"method":"initialize","params":{"clientInfo":{"name":"codex-usage-mac","version":"1.0.0"},"capabilities":{"experimentalApi":true}}}
                """,
                timeout.Token).ConfigureAwait(false);

            string initialize = await WaitForResponseAsync(process.StandardOutput, 1, timeout.Token).ConfigureAwait(false);
            ThrowIfProtocolError(initialize);

            await SendAsync(process.StandardInput, """{"method":"initialized"}""", timeout.Token).ConfigureAwait(false);
            await SendAsync(process.StandardInput,
                """{"id":2,"method":"account/rateLimits/read","params":null}""",
                timeout.Token).ConfigureAwait(false);

            string response = await WaitForResponseAsync(process.StandardOutput, 2, timeout.Token).ConfigureAwait(false);
            ThrowIfProtocolError(response);
            return ParseUsageResponse(response, DateTimeOffset.Now);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                "Timed out while asking Codex for rate limits. Run `codex-usage doctor` and verify `codex login status`.");
        }
        catch (Win32Exception exception)
        {
            throw new InvalidOperationException(
                "Codex CLI was not found. Run `codex-usage doctor` for guided setup.", exception);
        }
        finally
        {
            try
            {
                process.StandardInput.Close();
            }
            catch
            {
            }

            if (!process.HasExited)
            {
                try { process.Kill(entireProcessTree: true); }
                catch { }
            }

            if (stderrTask is not null)
            {
                try { _ = await stderrTask.ConfigureAwait(false); }
                catch { }
            }
        }
    }

    private static ProcessStartInfo CreateStartInfo()
    {
        string executable = Environment.GetEnvironmentVariable("CODEX_CLI")?.Trim() ?? "codex";
        ProcessStartInfo info = new(executable)
        {
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
        };
        info.ArgumentList.Add("app-server");
        info.ArgumentList.Add("--listen");
        info.ArgumentList.Add("stdio://");
        return info;
    }

    private static async Task SendAsync(StreamWriter writer, string message, CancellationToken cancellationToken)
    {
        await writer.WriteLineAsync(message.AsMemory(), cancellationToken).ConfigureAwait(false);
        await writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<string> WaitForResponseAsync(TextReader reader, int responseId, CancellationToken cancellationToken)
    {
        while (true)
        {
            string? line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
                throw new InvalidOperationException("Codex exited before returning usage data.");

            JsonDocument? document = null;
            try
            {
                document = JsonDocument.Parse(line);
            }
            catch (JsonException)
            {
                continue;
            }

            using (document)
            {
                if (document.RootElement.TryGetProperty("id", out JsonElement idElement)
                    && idElement.ValueKind == JsonValueKind.Number
                    && idElement.TryGetInt32(out int id)
                    && id == responseId)
                {
                    return line;
                }
            }
        }
    }

    private static void ThrowIfProtocolError(string response)
    {
        using JsonDocument document = JsonDocument.Parse(response);
        if (!document.RootElement.TryGetProperty("error", out JsonElement error)) return;

        string message = error.TryGetProperty("message", out JsonElement detail)
            ? detail.GetString() ?? error.ToString()
            : error.ToString();
        throw new InvalidOperationException($"Codex app-server error: {message}");
    }

    internal static UsageSnapshot ParseUsageResponse(string response, DateTimeOffset refreshedAt)
    {
        using JsonDocument document = JsonDocument.Parse(response);
        JsonElement result = document.RootElement.GetProperty("result");
        JsonElement bucket = SelectCodexBucket(result);
        Dictionary<long, LimitWindow> windows = [];

        AddWindow(bucket, "primary", windows);
        AddWindow(bucket, "secondary", windows);

        windows.TryGetValue(FiveHourMinutes, out LimitWindow? fiveHour);
        windows.TryGetValue(WeeklyMinutes, out LimitWindow? weekly);
        return new UsageSnapshot(fiveHour, weekly, refreshedAt);
    }

    private static JsonElement SelectCodexBucket(JsonElement result)
    {
        if (result.TryGetProperty("rateLimitsByLimitId", out JsonElement buckets)
            && buckets.ValueKind == JsonValueKind.Object
            && buckets.TryGetProperty("codex", out JsonElement codex)
            && codex.ValueKind == JsonValueKind.Object)
        {
            return codex;
        }

        if (result.TryGetProperty("rateLimits", out JsonElement legacy)
            && legacy.ValueKind == JsonValueKind.Object)
        {
            return legacy;
        }

        throw new InvalidOperationException("Codex usage bucket was not present in the app-server response.");
    }

    private static void AddWindow(JsonElement bucket, string propertyName, IDictionary<long, LimitWindow> windows)
    {
        if (!bucket.TryGetProperty(propertyName, out JsonElement window)
            || window.ValueKind != JsonValueKind.Object
            || !window.TryGetProperty("windowDurationMins", out JsonElement durationElement)
            || !durationElement.TryGetInt64(out long duration)
            || !window.TryGetProperty("usedPercent", out JsonElement usedElement)
            || usedElement.ValueKind != JsonValueKind.Number)
        {
            return;
        }

        double used = Math.Clamp(usedElement.GetDouble(), 0d, 100d);
        windows[duration] = new LimitWindow(duration, used, ReadResetTime(window));
    }

    private static DateTimeOffset? ReadResetTime(JsonElement window)
    {
        if (!window.TryGetProperty("resetsAt", out JsonElement resetElement)
            || !resetElement.TryGetInt64(out long seconds))
        {
            return null;
        }

        try { return DateTimeOffset.FromUnixTimeSeconds(seconds).ToLocalTime(); }
        catch (ArgumentOutOfRangeException) { return null; }
    }
}
