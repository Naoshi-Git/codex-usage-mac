using System.Globalization;
using System.Text;
using System.Text.Json;

namespace CodexUsageMac;

internal sealed record WindowAnalysis(
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd,
    double TargetUsedPercent,
    double UsedPercent,
    double DeltaPoints,
    DateTimeOffset? CatchUpAt);

internal sealed record WeeklyAnalysis(
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd,
    double TargetUsedPercent,
    double UsedPercent,
    double DeltaPoints,
    DateTimeOffset? CatchUpAt,
    DateTimeOffset? NextNightEnd,
    double? HeadroomAtNextNightEndPoints);

internal static class UsagePresenter
{
    internal static WindowAnalysis? AnalyzeWindow(LimitWindow? window, DateTimeOffset now)
    {
        if (window?.ResetsAt is not DateTimeOffset reset) return null;
        TimeSpan duration = TimeSpan.FromMinutes(window.DurationMinutes);
        DateTimeOffset start = reset - duration;
        double target = PacePercentAt(start, reset, now);
        double used = Math.Clamp(window.UsedPercent, 0d, 100d);
        double delta = used - target;
        DateTimeOffset? catchUp = null;
        if (delta > 0.05)
        {
            DateTimeOffset candidate = start + TimeSpan.FromTicks((long)(duration.Ticks * used / 100d));
            if (candidate > now && candidate <= reset) catchUp = candidate;
        }
        return new WindowAnalysis(start, reset, target, used, delta, catchUp);
    }

    internal static WeeklyAnalysis? AnalyzeWeekly(LimitWindow? weekly, DateTimeOffset now, NightWindow night)
    {
        WindowAnalysis? basic = AnalyzeWindow(weekly, now);
        if (basic is null) return null;

        DateTimeOffset nextNightEnd = night.NextEnd(now);
        double? headroom = null;
        if (nextNightEnd < basic.WindowEnd)
        {
            headroom = PacePercentAt(basic.WindowStart, basic.WindowEnd, nextNightEnd) - basic.UsedPercent;
        }

        return new WeeklyAnalysis(
            basic.WindowStart,
            basic.WindowEnd,
            basic.TargetUsedPercent,
            basic.UsedPercent,
            basic.DeltaPoints,
            basic.CatchUpAt,
            nextNightEnd < basic.WindowEnd ? nextNightEnd : null,
            headroom);
    }

    internal static void RenderText(UsageSnapshot snapshot, CliOptions options)
    {
        bool ja = options.Language == UiLanguage.Japanese;
        DateTimeOffset now = snapshot.RefreshedAt;
        WeeklyAnalysis? weekly = AnalyzeWeekly(snapshot.Weekly, now, options.Night);
        WindowAnalysis? fiveHour = AnalyzeWindow(snapshot.FiveHour, now);
        TerminalStyle style = new(!options.Plain && !Console.IsOutputRedirected);
        TerminalCard card = new(Math.Clamp(options.TimelineCells + 24, 64, 92), style);

        if (options.Mascot) RenderMascot(snapshot, weekly, style, ja);

        card.Top("Codex usage");
        card.Line($"  {style.Dim(now.ToString("MM/dd HH:mm", CultureInfo.InvariantCulture))}");
        card.Line();

        if (snapshot.Weekly is LimitWindow weeklyWindow && weekly is not null)
        {
            RenderWindow(card, ja ? "週次" : "Weekly", weeklyWindow,
                new WindowAnalysis(weekly.WindowStart, weekly.WindowEnd, weekly.TargetUsedPercent, weekly.UsedPercent, weekly.DeltaPoints, weekly.CatchUpAt),
                now, options, style, options.Night);
            RenderWeeklyAdvice(card, weekly, now, style, ja);
        }
        else
        {
            card.Line($"  {style.Yellow(ja ? "週次の使用量を取得できませんでした。" : "Weekly usage unavailable.")}");
        }

        card.Line();

        if (snapshot.FiveHour is LimitWindow fiveWindow && fiveHour is not null)
        {
            RenderWindow(card, ja ? "5時間" : "5 hour", fiveWindow, fiveHour, now, options, style, null);
            RenderCompactAdvice(card, fiveHour, now, style, ja);
        }
        else
        {
            card.Line($"  {style.Yellow(ja ? "5時間枠の使用量を取得できませんでした。" : "5-hour usage unavailable.")}");
        }

        card.Bottom();
    }

    private static void RenderWindow(
        TerminalCard card,
        string label,
        LimitWindow window,
        WindowAnalysis analysis,
        DateTimeOffset now,
        CliOptions options,
        TerminalStyle style,
        NightWindow? night)
    {
        bool ja = options.Language == UiLanguage.Japanese;
        string remaining = ja ? $"{window.RemainingPercent:F0}% 残り" : $"{window.RemainingPercent:F0}% left";
        string used = ja ? $"· {window.UsedPercent:F0}% 使用" : $"· {window.UsedPercent:F0}% used";
        string left = $"  {style.Bold(label)}  {style.Quota(remaining, window.RemainingPercent)}  {style.Dim(used)}";
        string right = style.Dim(ja
            ? $"reset {FormatUntil(window.ResetsAt, now, true)}"
            : $"reset in {FormatUntil(window.ResetsAt, now, false)}");
        card.Line(JoinColumns(left, right, Math.Clamp(options.TimelineCells + 20, 58, 88)));
        card.Line($"        {style.Dim(FormatRange(analysis.WindowStart, analysis.WindowEnd))}");

        string track = RenderUsageTrack(
            analysis.WindowStart,
            analysis.WindowEnd,
            options.TimelineCells,
            night,
            analysis.TargetUsedPercent,
            analysis.UsedPercent,
            unicode: !options.Plain);
        card.Line($"        {StyleTrack(track, style)}");

        string nowLegend = style.Cyan(ja ? $"● 今 {now:HH:mm}" : $"● now {now:HH:mm}");
        string targetLegend = style.Dim(ja ? $"目安 {analysis.TargetUsedPercent:F1}%" : $"target {analysis.TargetUsedPercent:F1}%");
        string usedLegend = style.Yellow(ja ? $"▲ 使用 {analysis.UsedPercent:F1}%" : $"▲ used {analysis.UsedPercent:F1}%");
        card.Line($"        {nowLegend}   {targetLegend}   {usedLegend}");
        if (night is NightWindow n)
            card.Line(style.Dim(ja ? $"        ░ 夜間 {n.Start:HH\\:mm}–{n.End:HH\\:mm}" : $"        ░ night {n.Start:HH\\:mm}–{n.End:HH\\:mm}"));
    }

    private static void RenderWeeklyAdvice(TerminalCard card, WeeklyAnalysis analysis, DateTimeOffset now, TerminalStyle style, bool ja)
    {
        RenderDelta(card, analysis.DeltaPoints, style, ja);
        if (analysis.DeltaPoints > 0.05 && analysis.CatchUpAt is DateTimeOffset catchUp)
            card.Line(style.Dim(ja
                ? $"          ↳ 使わなければ {FormatMoment(catchUp, now, true)} に目安へ戻る"
                : $"          ↳ back on target {FormatMoment(catchUp, now, false)} if idle"));

        if (analysis.NextNightEnd is DateTimeOffset next && analysis.HeadroomAtNextNightEndPoints is double headroom)
        {
            string when = FormatMoment(next, now, ja);
            string text = ja
                ? headroom >= 0 ? $"          ↳ {when}時点で {headroom:F1}pt 余裕" : $"          ↳ {when}時点でも {-headroom:F1}pt 先行"
                : headroom >= 0 ? $"          ↳ {headroom:F1}pt headroom at {when}" : $"          ↳ still {-headroom:F1}pt ahead at {when}";
            card.Line(style.Dim(text));
        }
    }

    private static void RenderCompactAdvice(TerminalCard card, WindowAnalysis analysis, DateTimeOffset now, TerminalStyle style, bool ja)
    {
        RenderDelta(card, analysis.DeltaPoints, style, ja);
        if (analysis.DeltaPoints > 0.05 && analysis.CatchUpAt is DateTimeOffset catchUp)
            card.Line(style.Dim(ja
                ? $"          ↳ 使わなければ {FormatMoment(catchUp, now, true)} に目安へ戻る"
                : $"          ↳ back on target {FormatMoment(catchUp, now, false)} if idle"));
    }

    private static void RenderDelta(TerminalCard card, double delta, TerminalStyle style, bool ja)
    {
        if (delta > 0.05)
            card.Line($"        {style.Yellow(ja ? $"▲ 目安より +{delta:F1}pt" : $"▲ +{delta:F1}pt above target")}");
        else if (delta < -0.05)
            card.Line($"        {style.Green(ja ? $"● 目安より {-delta:F1}pt 余裕" : $"● {-delta:F1}pt headroom")}");
        else
            card.Line($"        {style.Green(ja ? "● ほぼ目安どおり" : "● on target")}");
    }

    internal static string RenderUsageTrack(
        DateTimeOffset start,
        DateTimeOffset end,
        int cells,
        NightWindow? night,
        double targetUsedPercent,
        double usedPercent,
        bool unicode)
    {
        char day = unicode ? '─' : '-';
        char nightChar = unicode ? '░' : ':';
        char usedDay = unicode ? '━' : '=';
        char usedNight = unicode ? '▓' : '#';
        char nowMarker = unicode ? '●' : 'o';
        char usedMarker = unicode ? '▲' : '^';
        char overlap = unicode ? '◆' : '*';
        char[] track = new char[cells];
        TimeSpan span = end - start;

        for (int i = 0; i < cells; i++)
        {
            double fraction = (i + 0.5d) / cells;
            DateTimeOffset sample = start + TimeSpan.FromTicks((long)(span.Ticks * fraction));
            bool isNight = night is NightWindow n && n.Contains(TimeOnly.FromDateTime(sample.LocalDateTime));
            track[i] = isNight ? nightChar : day;
        }

        int targetIndex = PercentToIndex(targetUsedPercent, cells);
        int usedIndex = PercentToIndex(usedPercent, cells);
        for (int i = 0; i < usedIndex; i++) track[i] = track[i] == nightChar ? usedNight : usedDay;
        if (targetIndex == usedIndex) track[targetIndex] = overlap;
        else
        {
            track[targetIndex] = nowMarker;
            track[usedIndex] = usedMarker;
        }
        return new string(track);
    }

    private static int PercentToIndex(double percent, int cells) => Math.Clamp(
        (int)Math.Round(Math.Clamp(percent, 0d, 100d) / 100d * (cells - 1), MidpointRounding.AwayFromZero), 0, cells - 1);

    private static string StyleTrack(string track, TerminalStyle style)
    {
        if (!style.Enabled) return track;
        StringBuilder result = new();
        foreach (char ch in track)
        {
            result.Append(ch switch
            {
                '●' => style.Cyan(ch.ToString()),
                '▲' => style.Yellow(ch.ToString()),
                '◆' => style.Magenta(ch.ToString()),
                '━' or '=' or '▓' or '#' => style.Yellow(ch.ToString()),
                _ => style.Dim(ch.ToString()),
            });
        }
        return result.ToString();
    }

    internal static void RenderJson(UsageSnapshot snapshot, CliOptions options)
    {
        WeeklyAnalysis? weekly = AnalyzeWeekly(snapshot.Weekly, snapshot.RefreshedAt, options.Night);
        WindowAnalysis? five = AnalyzeWindow(snapshot.FiveHour, snapshot.RefreshedAt);
        object payload = new
        {
            refreshedAt = snapshot.RefreshedAt,
            weekly = snapshot.Weekly is null ? null : new
            {
                remainingPercent = snapshot.Weekly.RemainingPercent,
                usedPercent = snapshot.Weekly.UsedPercent,
                targetUsedPercent = weekly?.TargetUsedPercent,
                deltaPoints = weekly?.DeltaPoints,
                resetsAt = snapshot.Weekly.ResetsAt,
                catchUpAt = weekly?.CatchUpAt,
            },
            fiveHour = snapshot.FiveHour is null ? null : new
            {
                remainingPercent = snapshot.FiveHour.RemainingPercent,
                usedPercent = snapshot.FiveHour.UsedPercent,
                targetUsedPercent = five?.TargetUsedPercent,
                deltaPoints = five?.DeltaPoints,
                resetsAt = snapshot.FiveHour.ResetsAt,
                catchUpAt = five?.CatchUpAt,
            },
        };
        Console.WriteLine(JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
    }

    internal static double PacePercentAt(DateTimeOffset start, DateTimeOffset end, DateTimeOffset point)
    {
        double total = (end - start).TotalSeconds;
        return total <= 0d ? 0d : Math.Clamp((point - start).TotalSeconds / total * 100d, 0d, 100d);
    }

    private static string JoinColumns(string left, string right, int width)
    {
        int spaces = Math.Max(2, width - TerminalWidth.Visible(left) - TerminalWidth.Visible(right));
        return left + new string(' ', spaces) + right;
    }

    private static string FormatRange(DateTimeOffset start, DateTimeOffset end) =>
        start.LocalDateTime.Date == end.LocalDateTime.Date ? $"{start:HH:mm} → {end:HH:mm}" : $"{start:MM/dd HH:mm} → {end:MM/dd HH:mm}";

    private static string FormatUntil(DateTimeOffset? target, DateTimeOffset now, bool ja)
    {
        if (target is not DateTimeOffset value) return ja ? "不明" : "unknown";
        TimeSpan left = value - now;
        if (left <= TimeSpan.Zero) return ja ? "まもなく" : "soon";
        if (left.TotalDays >= 1) return ja ? $"{(int)left.TotalDays}日 {left.Hours}時間" : $"{(int)left.TotalDays}d {left.Hours}h";
        if (left.TotalHours >= 1) return ja ? $"{(int)left.TotalHours}時間 {left.Minutes}分" : $"{(int)left.TotalHours}h {left.Minutes}m";
        return ja ? $"{Math.Max(1, left.Minutes)}分" : $"{Math.Max(1, left.Minutes)}m";
    }

    private static string FormatMoment(DateTimeOffset value, DateTimeOffset now, bool ja)
    {
        if (value.LocalDateTime.Date == now.LocalDateTime.Date) return ja ? $"今日 {value:HH:mm}" : $"today {value:HH:mm}";
        if (value.LocalDateTime.Date == now.LocalDateTime.Date.AddDays(1)) return ja ? $"明日 {value:HH:mm}" : $"tomorrow {value:HH:mm}";
        return value.ToString("MM/dd HH:mm", CultureInfo.InvariantCulture);
    }

    private static void RenderMascot(UsageSnapshot snapshot, WeeklyAnalysis? weekly, TerminalStyle style, bool ja)
    {
        double remaining = Math.Min(snapshot.Weekly?.RemainingPercent ?? 100d, snapshot.FiveHour?.RemainingPercent ?? 100d);
        string face = remaining <= 15 ? "(×﹏×)" : weekly?.DeltaPoints > 10 ? "(•̀ᴗ•́)و" : "(•‿•)";
        string note = remaining <= 15 ? (ja ? "少し休ませどき" : "cool down") : weekly?.DeltaPoints > 10 ? (ja ? "やや先行" : "ahead of pace") : (ja ? "余裕あり" : "cruising");
        Console.WriteLine($"  {style.Cyan(face)}  {style.Dim(note)}");
        Console.WriteLine();
    }
}

internal static class HistoryPresenter
{
    internal static void Render(IReadOnlyList<UsageHistoryPoint> points, int days, bool plain, UiLanguage language)
    {
        bool ja = language == UiLanguage.Japanese;
        if (points.Count == 0)
        {
            Console.WriteLine(ja ? "履歴はまだありません。通常の `codex-usage` 実行で記録されます。" : "No history yet. Normal `codex-usage` runs append samples automatically.");
            Console.WriteLine(UsageHistoryStore.DefaultPath);
            return;
        }

        Console.WriteLine(ja ? $"Codex usage history · 過去{days}日" : $"Codex usage history · last {days} days");
        Console.WriteLine();
        Console.WriteLine($"Weekly  {Sparkline(points.Select(p => p.WeeklyUsedPercent), plain)}");
        Console.WriteLine($"5 hour  {Sparkline(points.Select(p => p.FiveHourUsedPercent), plain)}");
        Console.WriteLine(ja ? $"samples {points.Count} · weekly reset {CountWeeklyResets(points)} 回" : $"samples {points.Count} · weekly resets {CountWeeklyResets(points)}");
        Console.WriteLine();

        foreach (UsageHistoryPoint point in points.TakeLast(Math.Min(12, points.Count)))
        {
            string weekly = point.WeeklyUsedPercent is double w ? $"W {w,5:F1}%" : "W   n/a";
            string five = point.FiveHourUsedPercent is double f ? $"5h {f,5:F1}%" : "5h  n/a";
            Console.WriteLine($"{point.RecordedAt:MM/dd HH:mm}  {weekly}  {five}");
        }
        Console.WriteLine();
        Console.WriteLine(ja ? $"保存先: {UsageHistoryStore.DefaultPath}" : $"Stored at: {UsageHistoryStore.DefaultPath}");
    }

    private static int CountWeeklyResets(IReadOnlyList<UsageHistoryPoint> points)
    {
        int resets = 0;
        for (int i = 1; i < points.Count; i++)
        {
            if (points[i - 1].WeeklyResetsAt is DateTimeOffset prev
                && points[i].WeeklyResetsAt is DateTimeOffset current
                && current != prev)
            {
                resets++;
            }
        }
        return resets;
    }

    private static string Sparkline(IEnumerable<double?> source, bool plain)
    {
        double[] values = source.Where(v => v.HasValue).Select(v => Math.Clamp(v!.Value, 0d, 100d)).TakeLast(48).ToArray();
        if (values.Length == 0) return "n/a";
        if (plain) return string.Join(" ", values.Select(v => $"{v:F0}"));
        char[] levels = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        return new string(values.Select(v => levels[Math.Clamp((int)Math.Floor(v / 100d * levels.Length), 0, levels.Length - 1)]).ToArray());
    }
}
