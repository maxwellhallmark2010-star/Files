import ReplayKit
import SwiftUI

struct ContentView: View {
    @StateObject private var scanner = TVScanner()
    @State private var selected: TV?
    @State private var manualHost = ""

    private var extensionID: String { (Bundle.main.bundleIdentifier ?? "") + ".broadcast" }

    var body: some View {
        NavigationView {
            List {
                Section("1. Pick your TV") {
                    if scanner.tvs.isEmpty {
                        Text(scanner.status.isEmpty ? "Tap Scan to look for TVs." : scanner.status)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(Array(scanner.tvs.enumerated()), id: \.element.id) { index, tv in
                        Button { select(tv) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(tv.name).foregroundStyle(.primary)
                                    Text(index == 0 ? "\(tv.host) · nearest" : tv.host)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if selected?.id == tv.id { Image(systemName: "checkmark.circle.fill") }
                            }
                        }
                    }
                    Button(scanner.scanning ? "Scanning…" : "Scan for TVs") {
                        Task { await scanner.scan(); if selected == nil, let first = scanner.tvs.first { select(first) } }
                    }.disabled(scanner.scanning)
                    HStack {
                        TextField("TV IP address (optional)", text: $manualHost)
                            .keyboardType(.numbersAndPunctuation).autocorrectionDisabled()
                        Button("Find") { Task { await scanner.scan(manualHost: manualHost) } }
                            .disabled(manualHost.isEmpty || scanner.scanning)
                    }
                }
                Section("2. Start mirroring") {
                    VStack(spacing: 8) {
                        BroadcastPicker(extensionID: extensionID)
                            .frame(width: 72, height: 72)
                        Text(selected == nil ? "Pick a TV first"
                             : "Tap the icon, choose “Screen Cast”, then Start Broadcast.")
                            .font(.footnote).multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity)
                    Text("To stop, tap the red status bar / Dynamic Island and choose Stop.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Screen Cast")
        }
        .onAppear {
            if let url = Shared.defaults.string(forKey: Shared.controlKey), let name = Shared.defaults.string(forKey: Shared.nameKey), let u = URL(string: url) {
                selected = TV(name: name, host: u.host ?? "", controlURL: u, rtt: 0)
            }
            Task { await scanner.scan(); if selected == nil, let first = scanner.tvs.first { select(first) } }
        }
    }

    private func select(_ tv: TV) {
        selected = tv
        Shared.defaults.set(tv.controlURL.absoluteString, forKey: Shared.controlKey)
        Shared.defaults.set(tv.name, forKey: Shared.nameKey)
    }
}

/// Apple's system button that launches the broadcast extension.
struct BroadcastPicker: UIViewRepresentable {
    let extensionID: String

    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 72, height: 72))
        picker.preferredExtension = extensionID
        picker.showsMicrophoneButton = false
        return picker
    }

    func updateUIView(_ view: RPSystemBroadcastPickerView, context: Context) {}
}
