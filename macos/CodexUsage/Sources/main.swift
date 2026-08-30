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

/// The official OpenAI Blossom mark, rendered white on a transparent background.
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
        guard let path = Bundle.main.path(forResource: "openai-mark", ofType: "svg") else {
            return nil
        }
        return NSImage(contentsOfFile: path)
    }()
}

struct CircularGauge: View {
    let value: Double
    let color: Color
    let diameter: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.18), lineWidth: 4.2)
            Circle()
                // Show the actual remaining percentage; it may reach the full circle.
                .trim(from: 0, to: max(0.02, min(1, value / 100)))
                .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
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

    private var remaining: Double {
        store.snapshot?.weekly?.remainingPercent ?? 0
    }

    var body: some View {
        VStack(spacing: 8) {
            CircularGauge(value: remaining, color: accentGreen, diameter: 26)
            Text(store.errorMessage == nil
                 ? (store.snapshot == nil ? "—" : "\(Int(remaining.rounded()))%")
                 : "!")
                .font(.system(size: 10, weight: .light, design: .rounded))
                .foregroundStyle(store.errorMessage == nil ? .white : Color.orange)
        }
        .frame(width: 44, height: 78)
    }
}

/// Keeps the inner corners fully rounded while extending the screen-edge side.
struct EdgeRailShape: Shape {
    func path(in rect: CGRect) -> Path {
        let leftRadius = min(24, min(rect.width, rect.height) / 2)
        let rightRadius = min(8, min(rect.width, rect.height) / 2)
        var path = Path()

        path.move(to: CGPoint(x: leftRadius, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - rightRadius, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + rightRadius),
            control: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - rightRadius))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - rightRadius, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: leftRadius, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - leftRadius),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + leftRadius))
        path.addQuadCurve(
            to: CGPoint(x: leftRadius, y: rect.minY),
            control: CGPoint(x: rect.minX, y: rect.minY)
        )
        path.closeSubpath()
        return path
    }
}

struct WidgetView: View {
    @ObservedObject var store: UsageStore

    var body: some View {
        ZStack(alignment: .trailing) {
            VStack {
                Spacer()
                RailItem(store: store)
                Spacer()
            }
            .frame(width: 48, height: 140)
            .background(
                EdgeRailShape()
                    .fill(Color.black)
            )
            .shadow(color: .black.opacity(0.28), radius: 18, y: 8)
        }
        .frame(width: 410, height: 430, alignment: .trailing)
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

final class EdgeTriggerView: NSView {
    let onHover: (Bool) -> Void

    init(onHover: @escaping (Bool) -> Void) {
        self.onHover = onHover
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func updateTrackingAreas() {
        trackingAreas.forEach(removeTrackingArea)
        let options: NSTrackingArea.Options = [.mouseEnteredAndExited, .activeAlways, .inVisibleRect]
        addTrackingArea(NSTrackingArea(rect: .zero, options: options, owner: self, userInfo: nil))
        super.updateTrackingAreas()
    }

    override func mouseEntered(with event: NSEvent) { onHover(true) }
    override func mouseExited(with event: NSEvent) { onHover(false) }
}

final class EdgeTriggerPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class PanelController {
    private let panel: WidgetPanel
    private let panelSize = NSSize(width: 410, height: 430)
    private var edgeTrigger: EdgeTriggerPanel?

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
        // The widget is a visual indicator only for now. The invisible edge
        // trigger controls when it appears, so it never blocks the user's apps.
        panel.ignoresMouseEvents = true
        panel.contentView = NSHostingView(rootView: WidgetView(store: store))
    }

    func startEdgeReveal() {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
        let screenFrame = screen.frame
        let triggerFrame = NSRect(
            x: screenFrame.maxX - 1,
            y: screenFrame.minY,
            width: 1,
            height: screenFrame.height
        )
        let trigger = EdgeTriggerPanel(
            contentRect: triggerFrame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        trigger.isOpaque = false
        trigger.backgroundColor = .clear
        trigger.hasShadow = false
        trigger.level = .floating
        trigger.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        trigger.contentView = EdgeTriggerView { [weak self] entered in
            guard let self else { return }
            if entered {
                self.reveal(on: screen, cursorY: NSEvent.mouseLocation.y)
            } else {
                self.panel.orderOut(nil)
            }
        }
        edgeTrigger = trigger
        trigger.orderFrontRegardless()
        panel.orderOut(nil)
    }

    private func reveal(on screen: NSScreen, cursorY: CGFloat) {
        let frame = screen.frame
        let y = min(
            max(frame.minY, cursorY - panelSize.height / 2),
            frame.maxY - panelSize.height
        )
        let origin = NSPoint(
            x: frame.maxX - panelSize.width,
            y: y
        )
        panel.setFrame(NSRect(origin: origin, size: panelSize), display: true)
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
        panelController?.startEdgeReveal()
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
