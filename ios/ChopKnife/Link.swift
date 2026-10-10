// Chop knife link: finds the Mac relay over Bonjour (_chop._tcp) and exchanges newline-delimited JSON.
import Foundation
import Network

final class Link: ObservableObject {
    @Published var status = "Szukam Maca…"
    @Published var connected = false
    @Published var calibrated = false
    var onHaptic: ((Float, Float) -> Void)?

    private let queue = DispatchQueue(label: "chop.link", qos: .userInteractive)
    private var browser: NWBrowser?
    private var connection: NWConnection?
    private var buffer = Data()

    func start() {
        queue.async { self.browse() }
    }

    func connectManual(_ host: String) {
        let trimmed = host.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let port = NWEndpoint.Port(rawValue: 8791) else { return }
        queue.async {
            self.connection?.cancel()
            self.connection = nil
            self.connect(to: .hostPort(host: NWEndpoint.Host(trimmed), port: port))
        }
    }

    func send(_ text: String) {
        queue.async {
            guard let c = self.connection, c.state == .ready else { return }
            c.send(content: Data((text + "\n").utf8), completion: .idempotent)
        }
    }

    private func browse() {
        browser?.cancel()
        let b = NWBrowser(for: .bonjour(type: "_chop._tcp", domain: nil), using: .tcp)
        b.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, self.connection == nil, let first = results.first else { return }
            self.connect(to: first.endpoint)
        }
        b.stateUpdateHandler = { [weak self] state in
            if case .failed = state { self?.retry() }
        }
        b.start(queue: queue)
        browser = b
    }

    private func connect(to endpoint: NWEndpoint) {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        let c = NWConnection(to: endpoint, using: NWParameters(tls: nil, tcp: tcp))
        connection = c
        publish(false, "Łączę z Makiem…")
        c.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.publish(true, "Połączono z Makiem")
                self.receive(on: c)
            case .waiting:
                c.cancel()
            case .failed, .cancelled:
                if self.connection === c {
                    self.connection = nil
                    self.buffer.removeAll()
                    self.publish(false, "Szukam Maca…")
                    self.retry()
                }
            default:
                break
            }
        }
        c.start(queue: queue)
    }

    private func retry() {
        queue.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self, self.connection == nil else { return }
            self.browse()
        }
    }

    private func publish(_ ok: Bool, _ text: String) {
        DispatchQueue.main.async {
            self.connected = ok
            self.status = text
            if !ok { self.calibrated = false }
        }
    }

    private func receive(on c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            guard let self else { return }
            if let data {
                self.buffer.append(data)
                self.drain()
            }
            if done || error != nil {
                c.cancel()
                return
            }
            self.receive(on: c)
        }
    }

    private func drain() {
        while let nl = buffer.firstIndex(of: 10) {
            let line = Data(buffer[buffer.startIndex..<nl])
            buffer.removeSubrange(buffer.startIndex...nl)
            guard let obj = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any],
                  let type = obj["t"] as? String else { continue }
            if type == "h" {
                let i = (obj["i"] as? Double) ?? 0.5
                let s = (obj["s"] as? Double) ?? 0.5
                onHaptic?(Float(i), Float(s))
            } else if type == "state" {
                let cal = (obj["calibrated"] as? Bool) ?? false
                DispatchQueue.main.async { self.calibrated = cal }
            }
        }
    }
}
