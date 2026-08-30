import AppKit
import Combine
import Foundation
import SwiftUI

// MARK: - Data model

struct UsageWindow: Sendable {
    let usedPercent: Double
    let resetsAt: Date?

    var remainingPercent: Double {
        max(0, min(100, 100 - usedPercent))
    }
}

struct UsageSnapshot: Sendable {
    let fiveHour: UsageWindow?
    let weekly: UsageWindow?
    let refreshedAt: Date
}

enum CodexClientError: LocalizedError {
    case executableNotFound
    case invalidResponse
    case protocolError(String)
    case launchFailed(String)

    var errorDescription: String? {
        switch self {
        case .executableNotFound:
            return "Codexが見つかりません"
        case .invalidResponse:
            return "Codexから予期しない応答が返りました"
        case .protocolError(let message):
            return message
        case .launchFailed(let message):
            return message
        }
    }
}

enum CodexClient {
    static func executablePath() -> String? {
        var candidates: [String] = []
        if let override = ProcessInfo.processInfo.environment["CODEX_CLI"], !override.isEmpty {
            candidates.append(override)
        }
        candidates += [
            "/Applications/ChatGPT.app/Contents/Resources/codex",
            "/Applications/Codex.app/Contents/Resources/codex",
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex"
        ]

        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    static func readUsage() -> Result<UsageSnapshot, Error> {
        guard let path = executablePath() else {
            return .failure(CodexClientError.executableNotFound)
        }

        let process = Process()
        let input = Pipe()
        let output = Pipe()
        let error = Pipe()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = ["app-server", "--stdio"]
        process.standardInput = input
        process.standardOutput = output
        process.standardError = error

        do {
            try process.run()
        } catch {
            return .failure(CodexClientError.launchFailed(error.localizedDescription))
        }

        defer {
            if process.isRunning { process.terminate() }
        }

        do {
            try writeJSON([
                "id": 1,
                "method": "initialize",
                "params": [
                    "clientInfo": ["name": "codex-usage-mac-app", "version": "1.0.0"],
                    "capabilities": ["experimentalApi": true]
                ]
            ], to: input.fileHandleForWriting)
            let initialize = try readResponse(id: 1, from: output.fileHandleForReading)
            try throwIfProtocolError(initialize)

            try writeJSON(["method": "initialized"], to: input.fileHandleForWriting)
            try writeJSON([
                "id": 2,
                "method": "account/rateLimits/read",
                "params": NSNull()
            ], to: input.fileHandleForWriting)
            let response = try readResponse(id: 2, from: output.fileHandleForReading)
            try throwIfProtocolError(response)
            return .success(try parse(response))
        } catch {
            return .failure(error)
        }
    }

    private static func writeJSON(_ object: [String: Any], to handle: FileHandle) throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [])
        handle.write(data)
        handle.write(Data([0x0A]))
    }

    private static func readJSONLine(from handle: FileHandle) throws -> [String: Any] {
        var data = Data()
        while true {
            guard let byte = try handle.read(upToCount: 1), !byte.isEmpty else {
                throw CodexClientError.protocolError("Codexが応答する前に終了しました")
            }
            if byte[byte.startIndex] == 0x0A { break }
            data.append(byte)
        }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw CodexClientError.invalidResponse
        }
        return object
    }

    private static func readResponse(id: Int, from handle: FileHandle) throws -> [String: Any] {
        while true {
            let message = try readJSONLine(from: handle)
            guard let messageID = number(message["id"]), Int(messageID) == id else {
                // app-server notifications can arrive between request responses.
                continue
            }
            return message
        }
    }

    private static func throwIfProtocolError(_ response: [String: Any]) throws {
        guard let error = response["error"] as? [String: Any] else { return }
        let message = error["message"] as? String ?? "Codex APIエラー"
        throw CodexClientError.protocolError(message)
    }

    private static func parse(_ response: [String: Any]) throws -> UsageSnapshot {
        guard let result = response["result"] as? [String: Any] else {
            throw CodexClientError.invalidResponse
        }
        let byLimit = result["rateLimitsByLimitId"] as? [String: Any]
        let bucket = (byLimit?["codex"] as? [String: Any]) ?? (result["rateLimits"] as? [String: Any])
        guard let bucket else { throw CodexClientError.invalidResponse }

        return UsageSnapshot(
            fiveHour: parseWindow(bucket["primary"]),
            weekly: parseWindow(bucket["secondary"]),
            refreshedAt: Date()
        )
    }

    private static func parseWindow(_ value: Any?) -> UsageWindow? {
        guard let object = value as? [String: Any],
              let duration = number(object["windowDurationMins"]),
              let used = number(object["usedPercent"]) else { return nil }
        let reset = number(object["resetsAt"]).map { Date(timeIntervalSince1970: $0) }
        if duration != 300 && duration != 10_080 { return nil }
        return UsageWindow(usedPercent: max(0, min(100, used)), resetsAt: reset)
    }

    private static func number(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }
}

// MARK: - Store

@MainActor
final class UsageStore: ObservableObject {
    @Published private(set) var snapshot: UsageSnapshot?
    @Published private(set) var isLoading = true
    @Published private(set) var errorMessage: String?
    @Published private(set) var lastUpdated: Date?

    private var timer: Timer?

    func start() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refresh()
            }
        }
    }

    func refresh() {
        isLoading = true
        Task.detached {
            let result = CodexClient.readUsage()
            await MainActor.run {
                self.isLoading = false
                switch result {
                case .success(let snapshot):
                    self.snapshot = snapshot
                    self.lastUpdated = snapshot.refreshedAt
                    self.errorMessage = nil
                case .failure(let error):
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }
}

// MARK: - View helpers

private let accentOrange = Color(red: 1.0, green: 0.28, blue: 0.05)
private let accentGreen = Color(red: 0.05, green: 0.92, blue: 0.53)
private let softGray = Color.white.opacity(0.30)

/// Loads the official mark bundled with ChatGPT and removes its white tile.
/// The remaining logo is inverted to white, so only the lines sit on the rail.
struct OpenAIMark: View {
    var body: some View {
        Group {
            if let image = Self.image {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
            } else {
                // Fallback for Macs where the ChatGPT app is not installed.
                Canvas { context, size in
                    let center = CGPoint(x: size.width / 2, y: size.height / 2)
                    let radius = min(size.width, size.height) * 0.34
                    let stroke = StrokeStyle(
                        lineWidth: max(1.6, min(size.width, size.height) * 0.085),
                        lineCap: .round,
                        lineJoin: .round
                    )
                    for index in 0..<6 {
                        let angle = Angle.degrees(Double(index) * 60 - 90).radians
                        let start = CGPoint(
                            x: center.x + cos(angle - .pi / 3) * radius,
                            y: center.y + sin(angle - .pi / 3) * radius
                        )
                        let end = CGPoint(
                            x: center.x + cos(angle + .pi / 3) * radius,
                            y: center.y + sin(angle + .pi / 3) * radius
                        )
                        let controlRadius = radius * 1.18
                        let control1 = CGPoint(
                            x: center.x + cos(angle - .pi / 2) * controlRadius,
                            y: center.y + sin(angle - .pi / 2) * controlRadius
                        )
                        let control2 = CGPoint(
                            x: center.x + cos(angle + .pi / 2) * controlRadius,
                            y: center.y + sin(angle + .pi / 2) * controlRadius
                        )
                        var petal = Path()
                        petal.move(to: start)
                        petal.addCurve(to: end, control1: control1, control2: control2)
                        context.stroke(petal, with: .color(.white), style: stroke)
                    }
                }
            }
        }
        .accessibilityLabel("OpenAI")
    }

    private static let image: NSImage? = {
        let path = "/Applications/ChatGPT.app/Contents/Resources/icon-chatgpt.png"
        guard let source = NSImage(contentsOfFile: path),
              let cgImage = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return nil
        }

        let input = CIImage(cgImage: cgImage)
        guard let removeWhite = CIFilter(name: "CIColorToAlpha"),
              let invert = CIFilter(name: "CIColorInvert") else { return nil }
        removeWhite.setValue(input, forKey: kCIInputImageKey)
        removeWhite.setValue(CIColor(red: 1, green: 1, blue: 1), forKey: "inputColor")
        guard let transparentLogo = removeWhite.outputImage else { return nil }
        invert.setValue(transparentLogo, forKey: kCIInputImageKey)
        guard let output = invert.outputImage else { return nil }

        let rep = NSCIImageRep(ciImage: output)
        let result = NSImage(size: rep.size)
        result.addRepresentation(rep)
        return result
    }()
}

struct CircularGauge: View {
    let value: Double
    let color: Color
    let diameter: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.18), lineWidth: 7)
            Circle()
                .trim(from: 0, to: max(0.02, min(1, value / 100)))
                .stroke(color, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.35), value: value)
            OpenAIMark()
                .frame(width: diameter * 0.54, height: diameter * 0.54)
        }
        .frame(width: diameter, height: diameter)
    }
}

struct ProgressBar: View {
    let value: Double
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.18))
                Capsule()
                    .fill(color)
                    .frame(width: proxy.size.width * max(0, min(1, value / 100)))
                    .animation(.easeOut(duration: 0.35), value: value)
            }
        }
        .frame(height: 7)
    }
}

struct SpeechPointer: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.midY - 13))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: 0, y: rect.midY + 13))
        path.closeSubpath()
        return path
    }
}

struct UsageRow: View {
    let title: String
    let window: UsageWindow?
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                Spacer(minLength: 8)
                if let window {
                    Text("リセットまで \(resetText(window.resetsAt))")
                        .font(.system(size: 12))
                        .foregroundStyle(softGray)
                } else {
                    Text("取得中…")
                        .font(.system(size: 12))
                        .foregroundStyle(softGray)
                }
            }
            ProgressBar(value: window?.usedPercent ?? 0, color: color)
            Text(window.map { "\(Int($0.usedPercent.rounded()))% 使用済み" } ?? "データなし")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
        }
    }
}

struct UsageCard: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 17) {
                HStack(spacing: 9) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(.white)
                    Text("Codex Usage")
                        .font(.system(size: 19, weight: .medium))
                        .foregroundStyle(.white)
                    Spacer()
                }
                UsageRow(title: "5時間枠", window: store.snapshot?.fiveHour, color: accentOrange)
                UsageRow(title: "週次枠", window: store.snapshot?.weekly, color: accentGreen)
                if let updated = store.lastUpdated {
                    Text("最終更新 \(updated.formatted(date: .omitted, time: .shortened))")
                        .font(.system(size: 11))
                        .foregroundStyle(softGray)
                } else if let error = store.errorMessage {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(Color.orange)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
            .frame(width: 296)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.black)
            )
            SpeechPointer()
                .fill(Color.black)
                .frame(width: 24, height: 34)
                .offset(x: 10)
        }
        .shadow(color: .black.opacity(0.28), radius: 18, y: 7)
    }
}

struct RailItem: View {
    @ObservedObject var store: UsageStore
    @Binding var expanded: Bool

    private var remaining: Double {
        store.snapshot?.weekly?.remainingPercent ?? 0
    }

    var body: some View {
        VStack(spacing: 8) {
            CircularGauge(value: remaining, color: accentGreen, diameter: 36)
            Text(store.errorMessage == nil
                 ? (store.snapshot == nil ? "—" : "\(Int(remaining.rounded()))%")
                 : "!")
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(store.errorMessage == nil ? .white : Color.orange)
        }
        .frame(width: 56, height: 78)
        .contentShape(Rectangle())
        .onHover { value in
            withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                expanded = value
            }
        }
        .onTapGesture {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                expanded.toggle()
            }
        }
    }
}

struct WidgetView: View {
    @ObservedObject var store: UsageStore
    @State private var expanded = false

    var body: some View {
        ZStack(alignment: .trailing) {
            if expanded {
                UsageCard(store: store)
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .trailing)))
                    .onHover { value in
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                            expanded = value
                        }
                    }
                    .padding(.trailing, 64)
                    .zIndex(2)
            }

            VStack {
                Spacer()
                RailItem(store: store, expanded: $expanded)
                Spacer()
            }
            .frame(width: 60, height: 140)
            .background(
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(Color.black)
            )
            .shadow(color: .black.opacity(0.28), radius: 18, y: 8)
            .onHover { value in
                if !value {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.10) {
                        if !expanded { return }
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                            expanded = false
                        }
                    }
                }
            }
        }
        .frame(width: 410, height: 430)
        .padding(.trailing, 10)
        .padding(.vertical, 10)
        .background(Color.clear)
    }
}

private func resetText(_ date: Date?) -> String {
    guard let date else { return "不明" }
    let seconds = max(0, Int(date.timeIntervalSinceNow.rounded(.up)))
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)分" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)時間\(minutes % 60 == 0 ? "" : "\(minutes % 60)分")" }
    return "\(hours / 24)日\(hours % 24 == 0 ? "" : "\(hours % 24)時間")"
}

// MARK: - Window and app lifecycle

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class PanelController {
    private let panel: WidgetPanel

    init(store: UsageStore) {
        panel = WidgetPanel(
            contentRect: NSRect(x: 0, y: 0, width: 410, height: 430),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = false
        panel.contentView = NSHostingView(rootView: WidgetView(store: store))
    }

    func show() {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
        let visible = screen.visibleFrame
        let size = NSSize(width: 410, height: 430)
        let origin = NSPoint(
            x: visible.maxX - size.width + 8,
            y: visible.midY - size.height / 2
        )
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
        panel.orderFrontRegardless()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = UsageStore()
    private var panelController: PanelController?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        panelController = PanelController(store: store)
        panelController?.show()
        store.start()
        setupStatusItem()
    }

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Codex Usage")
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "今すぐ更新", action: #selector(refresh), keyEquivalent: "r"))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "終了", action: #selector(terminate), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        item.menu = menu
        statusItem = item
    }

    @objc private func refresh() { store.refresh() }
    @objc private func terminate() { NSApp.terminate(nil) }
}

@main
struct CodexUsageApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}
