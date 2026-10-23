import CoreMedia
import Foundation
import VideoToolbox

/// Hardware H.264 encoder that emits Annex-B access units (what MPEG-TS wants).
final class H264Encoder {
    /// annexB access unit, whether it is a keyframe, presentation time in seconds
    var onFrame: ((Data, Bool, Double) -> Void)?

    private var session: VTCompressionSession?
    private var size = (w: 0, h: 0)
    private let startCode: [UInt8] = [0, 0, 0, 1]

    func encode(_ sample: CMSampleBuffer) {
        guard let pixels = CMSampleBufferGetImageBuffer(sample) else { return }
        let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels)
        if session == nil || size != (w, h) { makeSession(w, h) }
        guard let session else { return }
        _ = VTCompressionSessionEncodeFrame(
            session, imageBuffer: pixels,
            presentationTimeStamp: CMSampleBufferGetPresentationTimeStamp(sample),
            duration: .invalid, frameProperties: nil, infoFlagsOut: nil
        ) { [weak self] status, _, encoded in
            guard status == noErr, let encoded else { return }
            self?.handle(encoded)
        }
    }

    func stop() {
        if let session {
            VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
            VTCompressionSessionInvalidate(session)
        }
        session = nil
    }

    private func makeSession(_ w: Int, _ h: Int) {
        stop()
        size = (w, h)
        var s: VTCompressionSession?
        guard VTCompressionSessionCreate(
            allocator: nil, width: Int32(w), height: Int32(h), codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil,
            outputCallback: nil, refcon: nil, compressionSessionOut: &s) == noErr, let s else { return }
        func set(_ key: CFString, _ value: CFTypeRef) { VTSessionSetProperty(s, key: key, value: value) }
        set(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue)
        set(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Main_AutoLevel)
        set(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse)  // no B-frames: PTS == DTS
        set(kVTCompressionPropertyKey_AverageBitRate, 8_000_000 as CFNumber)
        set(kVTCompressionPropertyKey_ExpectedFrameRate, 30 as CFNumber)
        set(kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, 1 as CFNumber)
        VTCompressionSessionPrepareToEncodeFrames(s)
        session = s
    }

    private func handle(_ sample: CMSampleBuffer) {
        guard let block = CMSampleBufferGetDataBuffer(sample),
              let fmt = CMSampleBufferGetFormatDescription(sample) else { return }
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let keyframe = !((attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) ?? false)

        var out = Data(startCode + [0x09, 0xF0])  // access unit delimiter
        if keyframe {
            var count = 0
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                fmt, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil,
                parameterSetCountOut: &count, nalUnitHeaderLengthOut: nil)
            for i in 0..<count {
                var ptr: UnsafePointer<UInt8>?
                var len = 0
                CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                    fmt, parameterSetIndex: i, parameterSetPointerOut: &ptr, parameterSetSizeOut: &len,
                    parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil)
                if let ptr { out.append(contentsOf: startCode); out.append(ptr, count: len) }
            }
        }

        var total = 0
        var base: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil,
                                          totalLengthOut: &total, dataPointerOut: &base) == noErr,
              let base else { return }
        let bytes = UnsafeRawPointer(base)
        var pos = 0
        while pos + 4 <= total {  // AVCC (4-byte length prefix) -> Annex-B
            let len = Int(UInt32(bigEndian: bytes.loadUnaligned(fromByteOffset: pos, as: UInt32.self)))
            pos += 4
            guard len > 0, pos + len <= total else { break }
            out.append(contentsOf: startCode)
            out.append(bytes.advanced(by: pos).assumingMemoryBound(to: UInt8.self), count: len)
            pos += len
        }
        onFrame?(out, keyframe, CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)))
    }
}
