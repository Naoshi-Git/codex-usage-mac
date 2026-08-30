namespace CodexUsageMac;

internal sealed record LimitWindow(long DurationMinutes, double UsedPercent, DateTimeOffset? ResetsAt)
{
    internal double RemainingPercent => Math.Clamp(100d - UsedPercent, 0d, 100d);
}

internal sealed record UsageSnapshot(LimitWindow? FiveHour, LimitWindow? Weekly, DateTimeOffset RefreshedAt);

internal sealed record UsageHistoryPoint(
    DateTimeOffset RecordedAt,
    double? WeeklyUsedPercent,
    DateTimeOffset? WeeklyResetsAt,
    double? FiveHourUsedPercent,
    DateTimeOffset? FiveHourResetsAt);

internal enum CliCommand
{
    Status,
    History,
    Doctor,
}

internal enum UiLanguage
{
    English,
    Japanese,
}

internal readonly record struct NightWindow(TimeOnly Start, TimeOnly End)
{
    internal static NightWindow Default => new(new TimeOnly(0, 0), new TimeOnly(6, 0));

    internal bool Contains(TimeOnly time)
    {
        if (Start == End) return false;
        return Start < End ? time >= Start && time < End : time >= Start || time < End;
    }

    internal DateTimeOffset NextEnd(DateTimeOffset now)
    {
        DateTime local = now.LocalDateTime.Date + End.ToTimeSpan();
        DateTimeOffset candidate = new(local, now.Offset);
        return candidate <= now ? candidate.AddDays(1) : candidate;
    }

    internal static bool TryParse(string text, out NightWindow value)
    {
        value = Default;
        string[] parts = text.Split('-', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2
            || !TimeOnly.TryParse(parts[0], out TimeOnly start)
            || !TimeOnly.TryParse(parts[1], out TimeOnly end))
        {
            return false;
        }
        value = new NightWindow(start, end);
        return true;
    }
}

internal sealed record CliOptions(
    CliCommand Command,
    bool Json,
    bool Plain,
    bool SelfTest,
    bool Mascot,
    int? WatchSeconds,
    int TimelineCells,
    NightWindow Night,
    int HistoryDays,
    UiLanguage Language)
{
    internal static CliOptions Parse(string[] args)
    {
        CliCommand command = CliCommand.Status;
        bool commandSet = false;
        bool json = false;
        bool plain = false;
        bool selfTest = false;
        bool mascot = false;
        int? watchSeconds = null;
        int timelineCells = 56;
        NightWindow night = NightWindow.Default;
        int historyDays = 7;
        UiLanguage language = UiLanguage.English;

        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i];
            switch (arg)
            {
                case "status" when !commandSet:
                    command = CliCommand.Status;
                    commandSet = true;
                    break;
                case "history" when !commandSet:
                    command = CliCommand.History;
                    commandSet = true;
                    break;
                case "doctor" when !commandSet:
                    command = CliCommand.Doctor;
                    commandSet = true;
                    break;
                case "--json":
                    json = true;
                    break;
                case "--plain":
                case "--no-color":
                    plain = true;
                    break;
                case "--self-test":
                    selfTest = true;
                    break;
                case "--mascot":
                    mascot = true;
                    break;
                case "--watch":
                    watchSeconds = 60;
                    if (i + 1 < args.Length && int.TryParse(args[i + 1], out int seconds))
                    {
                        watchSeconds = Math.Clamp(seconds, 10, 3600);
                        i++;
                    }
                    break;
                case "--width":
                    if (i + 1 >= args.Length || !int.TryParse(args[++i], out timelineCells))
                        throw new ArgumentException("--width expects an integer from 28 to 72.");
                    timelineCells = Math.Clamp(timelineCells, 28, 72);
                    break;
                case "--night":
                    if (i + 1 >= args.Length || !NightWindow.TryParse(args[++i], out night))
                        throw new ArgumentException("--night expects HH:mm-HH:mm, for example 00:00-06:00.");
                    break;
                case "--days":
                    if (i + 1 >= args.Length || !int.TryParse(args[++i], out historyDays))
                        throw new ArgumentException("--days expects an integer from 1 to 30.");
                    historyDays = Math.Clamp(historyDays, 1, 30);
                    break;
                case "--30d":
                    historyDays = 30;
                    break;
                case "--en":
                    language = UiLanguage.English;
                    break;
                case "--ja":
                    language = UiLanguage.Japanese;
                    break;
                case "--lang":
                    if (i + 1 >= args.Length) throw new ArgumentException("--lang expects en or ja.");
                    string lang = args[++i].Trim().ToLowerInvariant();
                    language = lang switch
                    {
                        "en" or "english" => UiLanguage.English,
                        "ja" or "jp" or "japanese" => UiLanguage.Japanese,
                        _ => throw new ArgumentException("--lang expects en or ja."),
                    };
                    break;
                case "--help":
                case "-h":
                    throw new HelpRequestedException(language);
                default:
                    throw new ArgumentException($"Unknown option or command: {arg}");
            }
        }

        if (command == CliCommand.History && (watchSeconds is not null || json || mascot))
            throw new ArgumentException("history cannot be combined with --watch, --json, or --mascot.");
        if (command == CliCommand.Doctor && (watchSeconds is not null || json || mascot))
            throw new ArgumentException("doctor cannot be combined with --watch, --json, or --mascot.");
        if (json && watchSeconds is not null)
            throw new ArgumentException("--json cannot be combined with --watch.");
        if (json && mascot)
            throw new ArgumentException("--json cannot be combined with --mascot.");

        return new CliOptions(command, json, plain, selfTest, mascot, watchSeconds, timelineCells, night, historyDays, language);
    }
}

internal sealed class HelpRequestedException(UiLanguage language) : Exception
{
    internal UiLanguage Language { get; } = language;
}
