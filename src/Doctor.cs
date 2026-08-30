using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CodexUsageMac;

internal static class Doctor
{
    private const string OfficialInstall = "curl -fsSL https://chatgpt.com/codex/install.sh | sh";

    internal static async Task<int> RunAsync(UiLanguage language, CancellationToken cancellationToken = default)
    {
        bool ja = language == UiLanguage.Japanese;
        bool ok = true;

        Console.WriteLine("Codex Usage Doctor");
        Console.WriteLine($"macOS / {RuntimeInformation.OSArchitecture}");
        Console.WriteLine();

        if (!OperatingSystem.IsMacOS())
        {
            Fail(ja ? "macOS ではありません。このリポジトリは Mac 専用です。" : "This build is macOS-only.");
            return 1;
        }
        Pass(ja ? "macOS を検出" : "macOS detected");

        string codex = Environment.GetEnvironmentVariable("CODEX_CLI")?.Trim() ?? "codex";
        CommandResult version = await RunAsync(codex, ["--version"], cancellationToken).ConfigureAwait(false);
        if (!version.Started || version.ExitCode != 0)
        {
            ok = false;
            Fail(ja ? "Codex CLI が見つかりません。" : "Codex CLI was not found.");
            Console.WriteLine(ja ? "  公式インストール:" : "  Official installer:");
            Console.WriteLine($"  {OfficialInstall}");
            Console.WriteLine(ja ? "  その後 `codex` を一度起動して ChatGPT でログインしてください。" : "  Then run `codex` once and sign in with ChatGPT.");
            return 1;
        }
        Pass((ja ? "Codex CLI: " : "Codex CLI: ") + FirstLine(version.Stdout));

        CommandResult login = await RunAsync(codex, ["login", "status"], cancellationToken).ConfigureAwait(false);
        if (login.ExitCode == 0)
        {
            string detail = FirstLine(string.IsNullOrWhiteSpace(login.Stdout) ? login.Stderr : login.Stdout);
            Pass((ja ? "ログイン済み" : "Signed in") + (string.IsNullOrWhiteSpace(detail) ? "" : $": {detail}"));
        }
        else
        {
            ok = false;
            Fail(ja ? "Codex CLI がログイン状態ではありません。" : "Codex CLI is not signed in.");
            Console.WriteLine(ja ? "  実行: codex login" : "  Run: codex login");
        }

        CommandResult appServer = await RunAsync(codex, ["app-server", "--help"], cancellationToken).ConfigureAwait(false);
        if (appServer.ExitCode == 0)
        {
            Pass(ja ? "app-server を利用可能" : "app-server available");
        }
        else
        {
            ok = false;
            Fail(ja ? "Codex app-server を利用できません。Codex CLI を更新してください。" : "Codex app-server is unavailable. Update Codex CLI.");
            Console.WriteLine(ja ? "  再インストール候補:" : "  Reinstall/update with:");
            Console.WriteLine($"  {OfficialInstall}");
        }

        try
        {
            string directory = UsageHistoryStore.HistoryDirectory;
            Directory.CreateDirectory(directory);
            string probe = Path.Combine(directory, $".write-test-{Environment.ProcessId}");
            await File.WriteAllTextAsync(probe, "ok", cancellationToken).ConfigureAwait(false);
            File.Delete(probe);
            Pass((ja ? "履歴保存先: " : "History directory: ") + directory);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            ok = false;
            Fail((ja ? "履歴保存先へ書き込めません: " : "Cannot write history directory: ") + exception.Message);
        }

        Console.WriteLine();
        Console.WriteLine(ok
            ? (ja ? "すべて正常です。`codex-usage` を実行できます。" : "All checks passed. Run `codex-usage`.")
            : (ja ? "上記の項目を修正してから再度 `codex-usage doctor` を実行してください。" : "Fix the failed checks, then run `codex-usage doctor` again."));
        return ok ? 0 : 1;
    }

    internal static async Task<CommandResult> RunAsync(string executable, IReadOnlyList<string> args, CancellationToken cancellationToken)
    {
        ProcessStartInfo info = new(executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (string arg in args) info.ArgumentList.Add(arg);

        using Process process = new() { StartInfo = info };
        try
        {
            if (!process.Start()) return new CommandResult(false, -1, "", "Could not start process.");
        }
        catch
        {
            return new CommandResult(false, -1, "", "Executable not found.");
        }

        Task<string> stdout = process.StandardOutput.ReadToEndAsync(cancellationToken);
        Task<string> stderr = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        return new CommandResult(true, process.ExitCode, await stdout.ConfigureAwait(false), await stderr.ConfigureAwait(false));
    }

    private static string FirstLine(string value) => value
        .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .FirstOrDefault() ?? "";

    private static void Pass(string text) => Console.WriteLine($"[OK]   {text}");
    private static void Fail(string text) => Console.WriteLine($"[FAIL] {text}");

    internal sealed record CommandResult(bool Started, int ExitCode, string Stdout, string Stderr);
}
