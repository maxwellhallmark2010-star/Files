import Foundation

/// Values and helpers used by both the app and the broadcast extension.
enum Shared {
    static let streamPort: UInt16 = 8554
    static let controlKey = "tvControlURL"
    static let nameKey = "tvName"

    /// Set in project.yml (APP_GROUP_ID) and surfaced through each target's Info.plist.
    static var appGroup: String {
        Bundle.main.object(forInfoDictionaryKey: "AppGroupID") as? String ?? ""
    }

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    /// This phone's Wi-Fi IPv4 address.
    static func localIPv4() -> String? {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
        defer { freeifaddrs(ifaddr) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let i = ptr.pointee
            guard let addr = i.ifa_addr,
                  addr.pointee.sa_family == UInt8(AF_INET),
                  String(cString: i.ifa_name) == "en0" else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count),
                        nil, 0, NI_NUMERICHOST)
            return String(cString: host)
        }
        return nil
    }
}
