import SwiftUI
import Network

@main struct SpikeApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

struct ContentView: View {
    @State var text = ""
    @State var status = "idle"
    @State var browser: NWBrowser?
    var body: some View {
        VStack(spacing: 16) {
            Text("UK Spike").font(.title)
            TextField("type here", text: $text).textFieldStyle(.roundedBorder).padding()
            Button("Container app: trigger Local Network prompt") {
                let p = NWParameters(); p.includePeerToPeer = true
                let b = NWBrowser(for: .bonjour(type: "_ukeys._tcp", domain: nil), using: p)
                b.stateUpdateHandler = { status = "app browser \($0)" }
                b.browseResultsChangedHandler = { r, _ in status = "app sees \(r.count) result(s)" }
                b.start(queue: .main); browser = b
            }
            Text(status).font(.footnote)
        }.padding()
    }
}
