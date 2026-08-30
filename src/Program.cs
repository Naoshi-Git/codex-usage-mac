using System.Text;

namespace CodexUsageMac;

internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        CliOptions options;
        try
        {
            options = CliOptions.Parse(args);
        }
        catch (HelpRequestedException help)
        {
            PrintHelp(help.Language);
            return 0;
        }
        catch (ArgumentException exception)
        {
            Console.Error.WriteLine(exception.Message);
            Console.Error.WriteLine("Run `codex-usage --help` for usage.");
            return 2;
        }

        if (options.SelfTest) return RunSelfTests();

        if (!OperatingSystem.IsMacOS())
        {
            Console.Error.WriteLine("codex-usage-mac supports macOS only.");
            return 1;
        }

        using CancellationTokenSource shutdown = new();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            shutdown.Cancel();
        };

        if (options.Command == CliCommand.Doctor)
            return await Doctor.RunAsync(options.Language, shutdown.Token).ConfigureAwait(false);

        UsageHistoryStore history = new();
        if (options.Command == CliCommand.History)
        {
            HistoryPresenter.Render(
                history.ReadSince(DateTimeOffset.Now.AddDays(-options.HistoryDays)),
                options.HistoryDays,
                options.Plain,
                options.Language);
            return 0;
        }

        CodexClient client = new();
        try
        {
            if (options.WatchSeconds is int seconds)
            {
                await RunWatchAsync(client, history, options, seconds, shutdown.Token).ConfigureAwait(false);
                return 0;
            }

            UsageSnapshot snapshot = await client.FetchAsync(shutdown.Token).ConfigureAwait(false);
            history.Record(snapshot);
            if (options.Json) UsagePresenter.RenderJson(snapshot, options);
            else UsagePresenter.RenderText(snapshot, options);
            return 0;
        }
        catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
        {
            return 130;
        }
        catch (Exception exception)
        {
            bool ja = options.Language == UiLanguage.Japanese;
            Console.Error.WriteLine((ja ? "取得失敗: " : "Failed to read Codex usage: ") + exception.Message);
            Console.Error.WriteLine(ja
                ? "`codex-usage doctor` で Codex CLI・ログイン・app-server を確認してください。"
                : "Run `codex-usage doctor` to check Codex CLI, login, and app-server support.");
            return 1;
        }
    }

    private static async Task RunWatchAsync(
        CodexClient client,
        UsageHistoryStore history,
        CliOptions options,
        int seconds,
        CancellationToken cancellationToken)
    {
        UsageSnapshot snapshot = await client.FetchAsync(cancellationToken).ConfigureAwait(false);
        history.Record(snapshot);
        DateTimeOffset nextFetchAt = DateTimeOffset.UtcNow.AddSeconds(seconds);
        DateTimeOffset updatedUntil = DateTimeOffset.MinValue;
        int frame = 0;

        using LiveConsoleFrame live = new();
        while (!cancellationToken.IsCancellationRequested)
        {
            if (DateTimeOffset.UtcNow >= nextFetchAt)
            {
                UsageSnapshot fresh = await client.FetchAsync(cancellationToken).ConfigureAwait(false);
                history.Record(fresh);
                if (HasUsageChanged(snapshot, fresh)) updatedUntil = DateTimeOffset.UtcNow.AddSeconds(3);
                snapshot = fresh;
                nextFetchAt = DateTimeOffset.UtcNow.AddSeconds(seconds);
            }

            bool updated = DateTimeOffset.UtcNow < updatedUntil;
            live.Render(() =>
            {
                UsagePresenter.RenderText(snapshot, options);
                Console.WriteLine();
                RenderWatchFooter(options, updated, nextFetchAt, seconds);
            });

            frame++;
            TimeSpan tick = options.Mascot ? TimeSpan.FromMilliseconds(650) : TimeSpan.FromSeconds(1);
            await Task.Delay(tick, cancellationToken).ConfigureAwait(false);
        }
    }

    private static void RenderWatchFooter(CliOptions options, bool updated, DateTimeOffset nextFetchAt, int seconds)
    {
        TerminalStyle style = new(!options.Plain && !Console.IsOutputRedirected);
        int next = Math.Max(0, (int)Math.Ceiling((nextFetchAt - DateTimeOffset.UtcNow).TotalSeconds));
        string badge = style.Badge(updated ? "UPDATED" : "RUNNING", updated);
        string detail = options.Language == UiLanguage.Japanese
            ? $" 次回確認 {next}秒 · {seconds}秒周期 · Ctrl+C で終了"
            : $" next check {next}s · source every {seconds}s · Ctrl+C to stop";
        Console.WriteLine($"  {badge}{style.Dim(detail)}\u001b[K");
    }

    private static bool HasUsageChanged(UsageSnapshot previous, UsageSnapshot current) =>
        WindowChanged(previous.Weekly, current.Weekly) || WindowChanged(previous.FiveHour, current.FiveHour);

    private static bool WindowChanged(LimitWindow? previous, LimitWindow? current)
    {
        if (previous is null || current is null) return previous is not null || current is not null;
        return Math.Abs(previous.UsedPercent - current.UsedPercent) >= 0.01 || previous.ResetsAt != current.ResetsAt;
    }

    private static void PrintHelp(UiLanguage language)
    {
        bool ja = language == UiLanguage.Japanese;
        Console.WriteLine("Codex Usage for macOS");
        Console.WriteLine(ja
            ? "Codex CLI の rate limit を、時間ベースの使用目安と並べて表示します。"
            : "Shows Codex rate limits against a time-based usage target.");
        Console.WriteLine();
        Console.WriteLine(ja ? "使い方:" : "Usage:");
        Console.WriteLine("  codex-usage");
        Console.WriteLine("  codex-usage --watch 60");
        Console.WriteLine("  codex-usage --watch 60 --mascot");
        Console.WriteLine("  codex-usage history --30d");
        Console.WriteLine("  codex-usage doctor");
        Console.WriteLine();
        Console.WriteLine(ja ? "主なオプション:" : "Options:");
        Console.WriteLine(ja ? "  doctor              Codex CLI / ログイン / app-server を診断" : "  doctor              Check Codex CLI, login, app-server, and storage");
        Console.WriteLine(ja ? "  history             保存済み使用履歴を表示" : "  history             Show locally stored usage history");
        Console.WriteLine(ja ? "  --watch [秒]         ライブ表示。既定60秒、最小10秒" : "  --watch [sec]        Live view; defaults to 60s, minimum 10s");
        Console.WriteLine(ja ? "  --mascot             quota buddy を表示" : "  --mascot             Show a small quota buddy");
        Console.WriteLine("  --days 14            History range (1-30 days)");
        Console.WriteLine("  --30d                Shortcut for --days 30");
        Console.WriteLine("  --night 00:00-06:00  Night band on weekly rail");
        Console.WriteLine("  --width 56           Timeline width (28-72)");
        Console.WriteLine("  --json               Structured JSON output");
        Console.WriteLine("  --plain              Disable ANSI/Unicode styling");
        Console.WriteLine("  --en / --ja          UI language");
        Console.WriteLine("  --self-test          Offline self-test");
        Console.WriteLine();
        Console.WriteLine(ja
            ? "CODEX_CLI 環境変数で Codex 実行ファイルを明示できます。"
            : "Set CODEX_CLI to override the Codex executable path.");
    }

    private static int RunSelfTests()
    {
        try
        {
            DateTimeOffset start = new(2026, 8, 29, 0, 0, 0, TimeSpan.FromHours(9));
            DateTimeOffset end = start.AddDays(7);
            AssertNear(25d, UsagePresenter.PacePercentAt(start, end, start.AddHours(42)), 0.001, "weekly target");

            if (!NightWindow.TryParse("00:00-06:00", out NightWindow night)
                || !night.Contains(new TimeOnly(2, 0))
                || night.Contains(new TimeOnly(12, 0)))
                throw new InvalidOperationException("night window parse failed");

            CliOptions english = CliOptions.Parse(["--en"]);
            CliOptions japanese = CliOptions.Parse(["--ja"]);
            CliOptions doctor = CliOptions.Parse(["doctor"]);
            if (english.Language != UiLanguage.English || japanese.Language != UiLanguage.Japanese || doctor.Command != CliCommand.Doctor)
                throw new InvalidOperationException("option parsing failed");

            DateTimeOffset now = start.AddHours(42);
            LimitWindow weekly = new(CodexClient.WeeklyMinutes, 35d, end);
            WeeklyAnalysis analysis = UsagePresenter.AnalyzeWeekly(weekly, now, night)
                ?? throw new InvalidOperationException("weekly analysis missing");
            AssertNear(10d, analysis.DeltaPoints, 0.001, "delta points");

            string track = UsagePresenter.RenderUsageTrack(start, end, 28, night, analysis.TargetUsedPercent, analysis.UsedPercent, true);
            if (!track.Contains('●') || !track.Contains('▲'))
                throw new InvalidOperationException("usage track rendering failed");

            long reset = end.ToUnixTimeSeconds();
            string response =
                "{\"result\":{\"rateLimitsByLimitId\":{\"codex\":{" +
                "\"primary\":{\"usedPercent\":29,\"windowDurationMins\":300,\"resetsAt\":" + reset + "}," +
                "\"secondary\":{\"usedPercent\":35,\"windowDurationMins\":10080,\"resetsAt\":" + reset + "}}}}}";
            UsageSnapshot parsed = CodexClient.ParseUsageResponse(response, now);
            AssertNear(35d, parsed.Weekly?.UsedPercent ?? -1, 0.001, "weekly parse");
            AssertNear(29d, parsed.FiveHour?.UsedPercent ?? -1, 0.001, "5h parse");

            Console.WriteLine("Self-tests passed.");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Self-test failed: {exception.Message}");
            return 1;
        }
    }

    private static void AssertNear(double expected, double actual, double tolerance, string name)
    {
        if (Math.Abs(expected - actual) > tolerance)
            throw new InvalidOperationException($"{name}: expected {expected}, actual {actual}");
    }
}
