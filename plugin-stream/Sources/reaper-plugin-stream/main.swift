import Foundation
import ScreenCaptureKit
import CoreImage
import CoreGraphics
import Network

struct CaptureStatus: Codable {
    let capturing: Bool
    let title: String
    let width: Int
    let height: Int
}

enum CaptureError: LocalizedError {
    case missingTitle
    case noMatchingWindow(String)

    var errorDescription: String? {
        switch self {
        case .missingTitle:
            return "A plug-in title is required."
        case .noMatchingWindow(let title):
            return "No visible plug-in window matched \(title)."
        }
    }
}

final class CaptureService: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let queue = DispatchQueue(label: "reaper.touch.capture", qos: .userInteractive)
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let lock = NSLock()
    private var frame = Data()
    private var windowFrame = CGRect.zero
    private var windowTitle = ""
    private var stream: SCStream?

    func latest() -> Data {
        lock.lock()
        defer { lock.unlock() }
        return frame
    }

    func status() -> CaptureStatus {
        lock.lock()
        defer { lock.unlock() }
        return CaptureStatus(
            capturing: stream != nil,
            title: windowTitle,
            width: Int(windowFrame.width),
            height: Int(windowFrame.height)
        )
    }

    func select(title requestedTitle: String) async throws -> CaptureStatus {
        let requested = requestedTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requested.isEmpty else { throw CaptureError.missingTitle }

        if let oldStream = lock.withLock({ stream }) {
            try? await oldStream.stopCapture()
        }
        lock.withLock {
            stream = nil
            frame = Data()
            windowFrame = .zero
            windowTitle = ""
        }

        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        guard let candidate = bestWindow(in: content.windows, matching: requested) else {
            throw CaptureError.noMatchingWindow(requested)
        }

        let filter = SCContentFilter(desktopIndependentWindow: candidate)
        let config = SCStreamConfiguration()
        config.width = max(1, min(1600, Int(candidate.frame.width * 2)))
        config.height = max(1, min(1200, Int(candidate.frame.height * 2)))
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.queueDepth = 3
        config.showsCursor = false
        config.capturesAudio = false

        let newStream = SCStream(filter: filter, configuration: config, delegate: self)
        try newStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        try await newStream.startCapture()

        lock.withLock {
            stream = newStream
            windowFrame = candidate.frame
            windowTitle = candidate.title ?? requested
        }

        let current = status()
        print("Capturing only plug-in window: \(current.title) [\(config.width)x\(config.height)]")
        return current
    }

    func stop() async {
        if let oldStream = lock.withLock({ stream }) {
            try? await oldStream.stopCapture()
        }
        lock.withLock {
            stream = nil
            frame = Data()
            windowFrame = .zero
            windowTitle = ""
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("Capture stopped: \(error.localizedDescription)\n", stderr)
        lock.lock()
        if self.stream === stream {
            self.stream = nil
            frame = Data()
        }
        lock.unlock()
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .screen, let imageBuffer = sampleBuffer.imageBuffer else { return }
        let image = CIImage(cvImageBuffer: imageBuffer)
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let data = context.jpegRepresentation(
            of: image,
            colorSpace: colorSpace,
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.78]
        ) else { return }
        lock.lock()
        frame = data
        lock.unlock()
    }

    func input(action: String, x: Double, y: Double) {
        lock.lock()
        let bounds = windowFrame
        let active = stream != nil
        lock.unlock()
        guard active, !bounds.isEmpty else { return }

        let normalizedX = min(1, max(0, x))
        let normalizedY = min(1, max(0, y))
        let point = CGPoint(
            x: bounds.minX + CGFloat(normalizedX) * bounds.width,
            y: bounds.minY + CGFloat(normalizedY) * bounds.height
        )
        let eventType: CGEventType = action == "down" ? .leftMouseDown : action == "up" ? .leftMouseUp : .leftMouseDragged
        CGEvent(
            mouseEventSource: nil,
            mouseType: eventType,
            mouseCursorPosition: point,
            mouseButton: .left
        )?.post(tap: .cghidEventTap)
    }

    private func bestWindow(in windows: [SCWindow], matching requested: String) -> SCWindow? {
        let requestedNormalized = Self.normalize(requested)
        let requestedTokens = Self.meaningfulTokens(requestedNormalized)
        guard !requestedTokens.isEmpty else { return nil }

        return windows.compactMap { window -> (SCWindow, Int)? in
            guard window.frame.width >= 120, window.frame.height >= 80 else { return nil }
            guard window.owningApplication?.bundleIdentifier == "com.cockos.reaper" else { return nil }
            let title = window.title ?? ""
            guard !title.isEmpty else { return nil }
            let candidateNormalized = Self.normalize(title)
            let candidateTokens = Set(candidateNormalized.split(separator: " ").map(String.init))
            let matches = requestedTokens.filter(candidateTokens.contains).count
            guard matches > 0 else { return nil }

            let exactBonus = candidateNormalized.contains(requestedNormalized) ? 100 : 0
            let ratio = Int((Double(matches) / Double(requestedTokens.count)) * 50)
            guard exactBonus > 0 || ratio >= 24 else { return nil }
            return (window, exactBonus + ratio + matches)
        }.max(by: { $0.1 < $1.1 })?.0
    }

    private static func normalize(_ value: String) -> String {
        value.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func meaningfulTokens(_ normalized: String) -> [String] {
        let generic: Set<String> = ["vst", "vst2", "vst3", "au", "audio", "unit", "plugin", "plug", "mono", "stereo", "track"]
        return normalized.split(separator: " ")
            .map(String.init)
            .filter { !generic.contains($0) && ($0.count >= 2 || $0.rangeOfCharacter(from: .decimalDigits) != nil) }
    }
}

final class HTTPServer: @unchecked Sendable {
    private let capture: CaptureService
    private let listener: NWListener

    init(capture: CaptureService) throws {
        self.capture = capture
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 47831)
        listener = try NWListener(using: parameters)
    }

    func start() {
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("Plug-in window bridge: http://127.0.0.1:47831 (idle until requested)")
            case .failed(let error):
                fputs("Plug-in window bridge failed: \(error.localizedDescription)\n", stderr)
            default:
                break
            }
        }
        listener.newConnectionHandler = { [capture] connection in
            connection.start(queue: .global(qos: .userInteractive))
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, _, _ in
                guard let data, let request = String(data: data, encoding: .utf8) else {
                    connection.cancel()
                    return
                }
                let path = request.components(separatedBy: " ").dropFirst().first ?? ""
                if request.hasPrefix("GET /stream.mjpeg") {
                    Self.stream(connection, capture)
                } else if request.hasPrefix("GET /status") {
                    Self.respondJSON(connection, status: 200, value: capture.status())
                } else if request.hasPrefix("POST /select") {
                    guard let json = Self.jsonBody(request), let title = json["title"] as? String else {
                        Self.respondError(connection, status: 400, message: "Missing plug-in title")
                        return
                    }
                    Task {
                        do {
                            let status = try await capture.select(title: title)
                            Self.respondJSON(connection, status: 200, value: status)
                        } catch {
                            Self.respondError(connection, status: 404, message: error.localizedDescription)
                        }
                    }
                } else if request.hasPrefix("POST /stop") {
                    Task {
                        await capture.stop()
                        Self.respondJSON(connection, status: 200, value: capture.status())
                    }
                } else if request.hasPrefix("POST /input") {
                    if let json = Self.jsonBody(request),
                       let action = json["action"] as? String,
                       let x = json["x"] as? Double,
                       let y = json["y"] as? Double,
                       ["down", "move", "up"].contains(action) {
                        capture.input(action: action, x: x, y: y)
                    }
                    Self.respond(connection, status: 204, contentType: nil, body: Data())
                } else {
                    Self.respondError(connection, status: 404, message: "Unknown endpoint \(path)")
                }
            }
        }
        listener.start(queue: .main)
    }

    private static func jsonBody(_ request: String) -> [String: Any]? {
        guard let range = request.range(of: "\r\n\r\n") else { return nil }
        let body = String(request[range.upperBound...])
        guard let data = body.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private static func respondJSON<T: Encodable>(_ connection: NWConnection, status: Int, value: T) {
        let encoder = JSONEncoder()
        let body = (try? encoder.encode(value)) ?? Data("{}".utf8)
        respond(connection, status: status, contentType: "application/json", body: body)
    }

    private static func respondError(_ connection: NWConnection, status: Int, message: String) {
        let body = (try? JSONSerialization.data(withJSONObject: ["error": message])) ?? Data("{}".utf8)
        respond(connection, status: status, contentType: "application/json", body: body)
    }

    private static func respond(_ connection: NWConnection, status: Int, contentType: String?, body: Data) {
        let reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 400 ? "Bad Request" : "Not Found"
        var headers = "HTTP/1.1 \(status) \(reason)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\n"
        if let contentType { headers += "Content-Type: \(contentType)\r\n" }
        headers += "Connection: close\r\n\r\n"
        var packet = Data(headers.utf8)
        packet.append(body)
        connection.send(content: packet, completion: .contentProcessed { _ in connection.cancel() })
    }

    private static func stream(_ connection: NWConnection, _ capture: CaptureService) {
        let header = Data("HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".utf8)
        connection.send(content: header, completion: .contentProcessed { error in
            if error == nil { sendFrame(connection, capture) }
        })
    }

    private static func sendFrame(_ connection: NWConnection, _ capture: CaptureService) {
        let frame = capture.latest()
        if frame.isEmpty {
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.04) { sendFrame(connection, capture) }
            return
        }
        var packet = Data("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: \(frame.count)\r\n\r\n".utf8)
        packet.append(frame)
        packet.append(Data("\r\n".utf8))
        connection.send(content: packet, completion: .contentProcessed { error in
            if error == nil {
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.033) { sendFrame(connection, capture) }
            }
        })
    }
}

do {
    let server = try HTTPServer(capture: CaptureService())
    server.start()
    dispatchMain()
} catch {
    fputs("REAPER Plugin Stream: \(error.localizedDescription)\n", stderr)
    exit(1)
}
