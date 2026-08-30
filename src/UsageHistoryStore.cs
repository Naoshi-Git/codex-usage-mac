using System.Text.Json;

namespace CodexUsageMac;

internal sealed class UsageHistoryStore
{
    internal static string HistoryDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        "Library",
        "Application Support",
        "CodexUsage");

    internal static string DefaultPath => Path.Combine(HistoryDirectory, "history.jsonl");

    private readonly string _path;
    private UsageHistoryPoint? _lastPoint;
    private bool _lastPointLoaded;

    internal UsageHistoryStore(string? path = null) => _path = path ?? DefaultPath;

    internal void Record(UsageSnapshot snapshot)
    {
        UsageHistoryPoint point = new(
            snapshot.RefreshedAt,
            snapshot.Weekly?.UsedPercent,
            snapshot.Weekly?.ResetsAt,
            snapshot.FiveHour?.UsedPercent,
            snapshot.FiveHour?.ResetsAt);

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            UsageHistoryPoint? latest = GetLastPoint();
            if (latest is not null
                && snapshot.RefreshedAt - latest.RecordedAt < TimeSpan.FromMinutes(2)
                && NearlyEqual(latest.WeeklyUsedPercent, point.WeeklyUsedPercent)
                && NearlyEqual(latest.FiveHourUsedPercent, point.FiveHourUsedPercent)
                && latest.WeeklyResetsAt == point.WeeklyResetsAt
                && latest.FiveHourResetsAt == point.FiveHourResetsAt)
            {
                return;
            }

            File.AppendAllText(_path, JsonSerializer.Serialize(point) + Environment.NewLine);
            _lastPoint = point;
            _lastPointLoaded = true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // History is auxiliary. A write failure must never block live quota display.
        }
    }

    internal IReadOnlyList<UsageHistoryPoint> ReadSince(DateTimeOffset since)
    {
        if (!File.Exists(_path)) return [];

        List<UsageHistoryPoint> points = [];
        try
        {
            foreach (string line in File.ReadLines(_path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    UsageHistoryPoint? point = JsonSerializer.Deserialize<UsageHistoryPoint>(line);
                    if (point is not null && point.RecordedAt >= since) points.Add(point);
                }
                catch (JsonException)
                {
                }
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return [];
        }

        return points.OrderBy(point => point.RecordedAt).ToArray();
    }

    private UsageHistoryPoint? GetLastPoint()
    {
        if (_lastPointLoaded) return _lastPoint;
        _lastPoint = ReadLastPointFromDisk();
        _lastPointLoaded = true;
        return _lastPoint;
    }

    private UsageHistoryPoint? ReadLastPointFromDisk()
    {
        if (!File.Exists(_path)) return null;
        try
        {
            string? last = File.ReadLines(_path).Reverse().FirstOrDefault(line => !string.IsNullOrWhiteSpace(line));
            return last is null ? null : JsonSerializer.Deserialize<UsageHistoryPoint>(last);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    private static bool NearlyEqual(double? left, double? right) =>
        left is null && right is null
        || left is double l && right is double r && Math.Abs(l - r) < 0.01;
}
