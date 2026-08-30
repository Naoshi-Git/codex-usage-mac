using System.Text;

namespace CodexUsageMac;

internal readonly record struct TerminalStyle(bool Enabled)
{
    internal string Bold(string text) => Paint("1", text);
    internal string Dim(string text) => Paint("2;37", text);
    internal string Cyan(string text) => Paint("36", text);
    internal string Green(string text) => Paint("32", text);
    internal string Yellow(string text) => Paint("33", text);
    internal string Magenta(string text) => Paint("35", text);
    internal string Red(string text) => Paint("31", text);
    internal string Badge(string text, bool updated) => updated ? Paint("1;30;42", $" {text} ") : Paint("1;30;46", $" {text} ");

    internal string Quota(string text, double remainingPercent) =>
        remainingPercent <= 10d ? Red(text)
        : remainingPercent <= 30d ? Yellow(text)
        : remainingPercent <= 60d ? Cyan(text)
        : Green(text);

    private string Paint(string code, string text) => Enabled ? $"\u001b[{code}m{text}\u001b[0m" : text;
}

internal sealed class TerminalCard
{
    private readonly int _innerWidth;
    private readonly TerminalStyle _style;

    internal TerminalCard(int innerWidth, TerminalStyle style)
    {
        _innerWidth = Math.Clamp(innerWidth, 56, 92);
        _style = style;
    }

    internal void Top(string title)
    {
        string prefix = "─ ";
        string suffix = " ";
        int fill = Math.Max(1, _innerWidth - TerminalWidth.Visible(prefix) - TerminalWidth.Visible(title) - TerminalWidth.Visible(suffix));
        Console.WriteLine($"{_style.Dim("╭" + prefix)}{_style.Bold(title)}{_style.Dim(suffix + new string('─', fill) + "╮")}");
    }

    internal void Line(string text = "")
    {
        int width = TerminalWidth.Visible(text);
        int padding = Math.Max(0, _innerWidth - width);
        Console.WriteLine($"{_style.Dim("│")}{text}{new string(' ', padding)}{_style.Dim("│")}");
    }

    internal void Bottom() => Console.WriteLine(_style.Dim("╰" + new string('─', _innerWidth) + "╯"));
}

internal sealed class LiveConsoleFrame : IDisposable
{
    private readonly bool _interactive;
    private readonly int _top;
    private bool _first = true;
    private bool _cursorHidden;

    internal LiveConsoleFrame()
    {
        _interactive = !Console.IsOutputRedirected;
        _top = _interactive ? Console.CursorTop : 0;
        if (_interactive)
        {
            try
            {
                Console.CursorVisible = false;
                _cursorHidden = true;
            }
            catch { }
        }
    }

    internal void Render(Action draw)
    {
        if (!_interactive)
        {
            draw();
            return;
        }

        if (!_first)
        {
            try { Console.SetCursorPosition(0, _top); }
            catch { Console.Write("\u001b[H"); }
        }

        draw();
        Console.Write("\u001b[J");
        _first = false;
    }

    public void Dispose()
    {
        if (_cursorHidden)
        {
            try { Console.CursorVisible = true; }
            catch { }
        }
        if (_interactive) Console.WriteLine();
    }
}

internal static class TerminalWidth
{
    internal static int Visible(string text)
    {
        int width = 0;
        for (int i = 0; i < text.Length;)
        {
            if (text[i] == '\u001b' && i + 1 < text.Length && text[i + 1] == '[')
            {
                i += 2;
                while (i < text.Length && text[i] != 'm') i++;
                if (i < text.Length) i++;
                continue;
            }

            Rune rune = Rune.GetRuneAt(text, i);
            width += IsWide(rune.Value) ? 2 : 1;
            i += rune.Utf16SequenceLength;
        }
        return width;
    }

    private static bool IsWide(int value) =>
        value >= 0x1100 && (
            value <= 0x115F
            || value is 0x2329 or 0x232A
            || value is >= 0x2E80 and <= 0xA4CF
            || value is >= 0xAC00 and <= 0xD7A3
            || value is >= 0xF900 and <= 0xFAFF
            || value is >= 0xFE10 and <= 0xFE19
            || value is >= 0xFE30 and <= 0xFE6F
            || value is >= 0xFF00 and <= 0xFF60
            || value is >= 0xFFE0 and <= 0xFFE6
            || value is >= 0x1F300 and <= 0x1FAFF
            || value is >= 0x20000 and <= 0x3FFFD);
}
