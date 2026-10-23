import Foundation

struct TV: Identifiable, Hashable {
    var id: String { host }
    let name: String
    let host: String
    let controlURL: URL
    let rtt: TimeInterval
}

/// Minimal DLNA/UPnP MediaRenderer client: describe a TV and tell it to play a URL.
enum DLNA {
    static let avt = "urn:schemas-upnp-org:service:AVTransport:1"

    static func msearch(st: String) -> Data {
        Data(("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n"
              + "MAN: \"ssdp:discover\"\r\nMX: 1\r\nST: \(st)\r\n\r\n").utf8)
    }

    static func location(in response: Data) -> URL? {
        guard let text = String(data: response, encoding: .utf8) else { return nil }
        for line in text.components(separatedBy: "\r\n") where line.lowercased().hasPrefix("location:") {
            return URL(string: line.dropFirst("location:".count).trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    /// Fetches the device description; returns nil if the device can't play media (no AVTransport).
    static func describe(location: URL, rtt: TimeInterval) async -> TV? {
        var req = URLRequest(url: location)
        req.timeoutInterval = 3
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let host = location.host else { return nil }
        let parser = DescriptionParser()
        let xml = XMLParser(data: data)
        xml.delegate = parser
        xml.parse()
        guard let path = parser.avtControl,
              let control = URL(string: path, relativeTo: location)?.absoluteURL else { return nil }
        return TV(name: parser.name ?? host, host: host, controlURL: control, rtt: rtt)
    }

    static func play(controlURL: URL, streamURL: String) async throws {
        _ = try? await soap(controlURL, "Stop", "<InstanceID>0</InstanceID>")
        let item = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" "
            + "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" "
            + "xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">"
            + "<item id=\"0\" parentID=\"0\" restricted=\"1\"><dc:title>Screen Cast</dc:title>"
            + "<upnp:class>object.item.videoItem</upnp:class>"
            + "<res protocolInfo=\"http-get:*:video/mpeg:*\">\(escape(streamURL))</res></item></DIDL-Lite>"
        try await soap(controlURL, "SetAVTransportURI",
                       "<InstanceID>0</InstanceID><CurrentURI>\(escape(streamURL))</CurrentURI>"
                       + "<CurrentURIMetaData>\(escape(item))</CurrentURIMetaData>")
        try await soap(controlURL, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")
    }

    static func stop(controlURL: URL) async {
        _ = try? await soap(controlURL, "Stop", "<InstanceID>0</InstanceID>")
    }

    @discardableResult
    private static func soap(_ url: URL, _ action: String, _ body: String) async throws -> Data {
        let envelope = "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" "
            + "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>"
            + "<u:\(action) xmlns:u=\"\(avt)\">\(body)</u:\(action)></s:Body></s:Envelope>"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 5
        req.httpBody = Data(envelope.utf8)
        req.setValue("text/xml; charset=\"utf-8\"", forHTTPHeaderField: "Content-Type")
        req.setValue("\"\(avt)#\(action)\"", forHTTPHeaderField: "SOAPACTION")
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw NSError(domain: "DLNA", code: http.statusCode,
                          userInfo: [NSLocalizedDescriptionKey: "TV rejected \(action) (HTTP \(http.statusCode))"])
        }
        return data
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

private final class DescriptionParser: NSObject, XMLParserDelegate {
    var name: String?
    var avtControl: String?
    private var text = ""
    private var lastServiceType = ""

    func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?,
                qualifiedName: String?, attributes: [String: String] = [:]) { text = "" }

    func parser(_ p: XMLParser, foundCharacters s: String) { text += s }

    func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch e {
        case "friendlyName" where name == nil: name = value
        case "serviceType": lastServiceType = value
        case "controlURL" where lastServiceType == DLNA.avt && avtControl == nil: avtControl = value
        default: break
        }
    }
}
