import Foundation
import Network

/// Tiny HTTP server that streams the live MPEG-TS to whoever connects (the TV).
final class StreamServer {
    private final class Client {
        let conn: NWConnection
        var inflight = 0
        var synced = false  // wait for a keyframe before sending anything
        init(_ c: NWConnection) { conn = c }
    }

    private let queue = DispatchQueue(label: "screencast.server")
    private var listener: NWListener?
    private var clients: [ObjectIdentifier: Client] = [:]

    func start(port: UInt16, ready: @escaping () -> Void) throws {
        let l = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
        l.stateUpdateHandler = { if case .ready = $0 { ready() } }
        l.newConnectionHandler = { [weak self] in self?.accept($0) }
        l.start(queue: queue)
        listener = l
    }

    func stop() {
        queue.async {
            self.listener?.cancel()
            self.clients.values.forEach { $0.conn.cancel() }
            self.clients.removeAll()
        }
    }

    func broadcast(_ data: Data, keyframe: Bool) {
        queue.async {
            for client in self.clients.values {
                if keyframe { client.synced = true }
                // Drop data for a slow TV instead of buffering without bound.
                guard client.synced, client.inflight < 40 else { continue }
                client.inflight += 1
                client.conn.send(content: data, completion: .contentProcessed { [weak client] _ in
                    self.queue.async { client?.inflight -= 1 }
                })
            }
        }
    }

    private func accept(_ conn: NWConnection) {
        conn.start(queue: queue)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                conn.cancel(); return
            }
            let head = "HTTP/1.1 200 OK\r\nContent-Type: video/mpeg\r\n"
                + "transferMode.dlna.org: Streaming\r\n"
                + "contentFeatures.dlna.org: DLNA.ORG_OP=00;DLNA.ORG_CI=0\r\n"
                + "Cache-Control: no-cache\r\nConnection: close\r\n\r\n"
            let isHead = request.hasPrefix("HEAD")
            conn.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] _ in
                guard let self else { return }
                if isHead { conn.cancel(); return }
                self.queue.async { self.clients[ObjectIdentifier(conn)] = Client(conn) }
            })
        }
        conn.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.queue.async { self?.clients[ObjectIdentifier(conn)] = nil }
            default: break
            }
        }
    }
}
