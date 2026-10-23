import ReplayKit

/// Receives every frame of the iPhone screen from iOS while a broadcast is running.
class SampleHandler: RPBroadcastSampleHandler {
    private let encoder = H264Encoder()
    private let muxer = TSMuxer()
    private let server = StreamServer()
    private var controlURL: URL?
    private var firstPTS: Double?

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        guard let control = Shared.defaults.string(forKey: Shared.controlKey).flatMap(URL.init(string:)) else {
            return fail("No TV selected. Open Screen Cast, pick a TV, then start again.")
        }
        guard let ip = Shared.localIPv4() else { return fail("Not connected to Wi-Fi.") }
        controlURL = control

        encoder.onFrame = { [weak self] annexB, keyframe, seconds in
            guard let self else { return }
            let first = self.firstPTS ?? seconds
            self.firstPTS = first
            let pts = UInt64(max(0, seconds - first) * 90_000) + 90_000  // keep PTS ahead of PCR
            self.server.broadcast(self.muxer.mux(annexB: annexB, pts: pts, keyframe: keyframe), keyframe: keyframe)
        }

        do {
            try server.start(port: Shared.streamPort) { [weak self] in
                let url = "http://\(ip):\(Shared.streamPort)/screen.ts"
                Task {
                    do { try await DLNA.play(controlURL: control, streamURL: url) }
                    catch { self?.fail("TV would not start playback: \(error.localizedDescription)") }
                }
            }
        } catch {
            fail("Could not start streaming server: \(error.localizedDescription)")
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with type: RPSampleBufferType) {
        if type == .video { encoder.encode(sampleBuffer) }
    }

    override func broadcastFinished() {
        encoder.stop()
        server.stop()
        if let controlURL { Task { await DLNA.stop(controlURL: controlURL) } }
    }

    private func fail(_ message: String) {
        finishBroadcastWithError(NSError(domain: "ScreenCast", code: 1,
                                         userInfo: [NSLocalizedDescriptionKey: message]))
    }
}
