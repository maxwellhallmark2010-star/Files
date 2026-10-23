import Foundation

/// Finds DLNA TVs by sending unicast SSDP probes to every address on the Wi-Fi subnet.
/// (Multicast discovery needs a special Apple entitlement; unicast does not.)
/// The TV that answers fastest is treated as the "nearest".
@MainActor
final class TVScanner: ObservableObject {
    @Published var tvs: [TV] = []
    @Published var scanning = false
    @Published var status = ""

    func scan(manualHost: String? = nil) async {
        guard !scanning else { return }
        scanning = true
        defer { scanning = false }

        var hosts: [String] = []
        if let manual = manualHost, !manual.isEmpty {
            hosts = [manual]
        } else if let ip = Shared.localIPv4() {
            let prefix = ip.split(separator: ".").prefix(3).joined(separator: ".")
            hosts = (1...254).map { "\(prefix).\($0)" }.filter { $0 != ip }
        } else {
            status = "Not on Wi-Fi."
            return
        }
        status = "Scanning…"

        let replies = await withCheckedContinuation { (c: CheckedContinuation<[String: (URL, Double)], Never>) in
            DispatchQueue.global().async { c.resume(returning: Self.probe(hosts: hosts, seconds: 3)) }
        }

        var found: [TV] = []
        await withTaskGroup(of: TV?.self) { group in
            for (_, reply) in replies {
                group.addTask { await DLNA.describe(location: reply.0, rtt: reply.1) }
            }
            for await tv in group { if let tv { found.append(tv) } }
        }
        tvs = found.sorted { $0.rtt < $1.rtt }
        status = tvs.isEmpty
            ? "No TVs found. Check you're on the same Wi-Fi, Local Network access is on, and the TV's DLNA / screen sharing option is enabled."
            : "Found \(tvs.count) TV\(tvs.count == 1 ? "" : "s")."
    }

    /// Blocking: sends probes, collects replies for `seconds`. Returns host -> (description URL, seconds to reply).
    nonisolated private static func probe(hosts: [String], seconds: Double) -> [String: (URL, Double)] {
        let fd = socket(AF_INET, SOCK_DGRAM, 0)
        guard fd >= 0 else { return [:] }
        defer { close(fd) }
        var timeout = timeval(tv_sec: 0, tv_usec: 200_000)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        let start = Date()
        for st in [DLNA.avt, "ssdp:all"] {
            let msg = DLNA.msearch(st: st)
            for host in hosts {
                var addr = sockaddr_in()
                addr.sin_family = sa_family_t(AF_INET)
                addr.sin_port = UInt16(1900).bigEndian
                inet_pton(AF_INET, host, &addr.sin_addr)
                msg.withUnsafeBytes { raw in
                    withUnsafePointer(to: &addr) {
                        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                            _ = sendto(fd, raw.baseAddress, raw.count, 0, $0,
                                       socklen_t(MemoryLayout<sockaddr_in>.size))
                        }
                    }
                }
            }
        }

        var results: [String: (URL, Double)] = [:]
        var buf = [UInt8](repeating: 0, count: 4096)
        while Date().timeIntervalSince(start) < seconds {
            var from = sockaddr_in()
            var len = socklen_t(MemoryLayout<sockaddr_in>.size)
            let n = withUnsafeMutablePointer(to: &from) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    recvfrom(fd, &buf, buf.count, 0, $0, &len)
                }
            }
            guard n > 0 else { continue }
            let rtt = Date().timeIntervalSince(start)
            var name = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            inet_ntop(AF_INET, &from.sin_addr, &name, socklen_t(INET_ADDRSTRLEN))
            let host = String(cString: name)
            if results[host] == nil, let url = DLNA.location(in: Data(buf[0..<n])) {
                results[host] = (url, rtt)
            }
        }
        return results
    }
}
