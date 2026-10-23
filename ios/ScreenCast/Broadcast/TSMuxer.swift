import Foundation

/// Wraps H.264 Annex-B access units into an MPEG transport stream (video only).
final class TSMuxer {
    private let pmtPID: UInt16 = 0x1000
    private let videoPID: UInt16 = 0x100
    private var counters: [UInt16: UInt8] = [:]

    /// `pts` is in 90 kHz units. PAT/PMT are re-sent before every keyframe so late joiners can sync.
    func mux(annexB: Data, pts: UInt64, keyframe: Bool) -> Data {
        var out = Data()
        if keyframe {
            out.append(psi(pid: 0, section: patSection()))
            out.append(psi(pid: pmtPID, section: pmtSection()))
        }
        var pes = Data([0x00, 0x00, 0x01, 0xE0, 0x00, 0x00, 0x80, 0x80, 0x05])
        pes.append(encodePTS(pts))
        pes.append(annexB)
        out.append(packetize(pid: videoPID, payload: pes, pcr: pts > 9000 ? pts - 9000 : 0, randomAccess: keyframe))
        return out
    }

    // MARK: - packets

    private func nextCC(_ pid: UInt16) -> UInt8 {
        let cc = counters[pid, default: 0]
        counters[pid] = (cc + 1) & 0x0F
        return cc
    }

    private func packetize(pid: UInt16, payload: Data, pcr: UInt64, randomAccess: Bool) -> Data {
        var out = Data()
        var offset = 0
        var first = true
        while offset < payload.count {
            var pkt = [UInt8](repeating: 0xFF, count: 188)
            pkt[0] = 0x47
            pkt[1] = (first ? 0x40 : 0x00) | UInt8(pid >> 8)
            pkt[2] = UInt8(pid & 0xFF)

            let minAF = first ? 8 : 0                      // length + flags + 6-byte PCR
            let payloadLen = min(payload.count - offset, 184 - minAF)
            let afTotal = 184 - payloadLen                 // 0 = no adaptation field; extra bytes are stuffing
            pkt[3] = (afTotal > 0 ? 0x30 : 0x10) | nextCC(pid)
            if afTotal > 0 {
                pkt[4] = UInt8(afTotal - 1)
                if afTotal > 1 {
                    pkt[5] = (first ? 0x10 : 0x00) | (first && randomAccess ? 0x40 : 0x00)
                    if first {
                        pkt[6] = UInt8((pcr >> 25) & 0xFF)
                        pkt[7] = UInt8((pcr >> 17) & 0xFF)
                        pkt[8] = UInt8((pcr >> 9) & 0xFF)
                        pkt[9] = UInt8((pcr >> 1) & 0xFF)
                        pkt[10] = UInt8(((pcr & 1) << 7) | 0x7E)
                        pkt[11] = 0x00
                    }
                }
            }
            let start = 4 + afTotal
            payload.withUnsafeBytes { raw in
                for i in 0..<payloadLen { pkt[start + i] = raw[offset + i] }
            }
            out.append(contentsOf: pkt)
            offset += payloadLen
            first = false
        }
        return out
    }

    private func psi(pid: UInt16, section: [UInt8]) -> Data {
        var pkt = [UInt8](repeating: 0xFF, count: 188)
        pkt[0] = 0x47
        pkt[1] = 0x40 | UInt8(pid >> 8)
        pkt[2] = UInt8(pid & 0xFF)
        pkt[3] = 0x10 | nextCC(pid)
        pkt[4] = 0x00  // pointer field
        for (i, b) in section.enumerated() { pkt[5 + i] = b }
        return Data(pkt)
    }

    // MARK: - tables

    private func patSection() -> [UInt8] {
        var s: [UInt8] = [0x00, 0xB0, 0x0D, 0x00, 0x01, 0xC1, 0x00, 0x00,
                          0x00, 0x01, 0xE0 | UInt8(pmtPID >> 8), UInt8(pmtPID & 0xFF)]
        s.append(contentsOf: mpegCRC(s))
        return s
    }

    private func pmtSection() -> [UInt8] {
        var s: [UInt8] = [0x02, 0xB0, 0x12, 0x00, 0x01, 0xC1, 0x00, 0x00,
                          0xE0 | UInt8(videoPID >> 8), UInt8(videoPID & 0xFF), 0xF0, 0x00,
                          0x1B, 0xE0 | UInt8(videoPID >> 8), UInt8(videoPID & 0xFF), 0xF0, 0x00]
        s.append(contentsOf: mpegCRC(s))
        return s
    }

    private func encodePTS(_ pts: UInt64) -> Data {
        Data([UInt8(0x21 | (((pts >> 30) & 0x07) << 1)),
              UInt8((pts >> 22) & 0xFF),
              UInt8((((pts >> 15) & 0x7F) << 1) | 1),
              UInt8((pts >> 7) & 0xFF),
              UInt8(((pts & 0x7F) << 1) | 1)])
    }

    /// MPEG-2 CRC32 (poly 0x04C11DB7, init 0xFFFFFFFF, no reflection, no final xor).
    private func mpegCRC(_ bytes: [UInt8]) -> [UInt8] {
        var crc: UInt32 = 0xFFFF_FFFF
        for b in bytes {
            crc ^= UInt32(b) << 24
            for _ in 0..<8 { crc = (crc & 0x8000_0000) != 0 ? (crc << 1) ^ 0x04C1_1DB7 : crc << 1 }
        }
        return [UInt8(crc >> 24), UInt8((crc >> 16) & 0xFF), UInt8((crc >> 8) & 0xFF), UInt8(crc & 0xFF)]
    }
}
