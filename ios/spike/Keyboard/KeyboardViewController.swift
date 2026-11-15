import UIKit
import Network
import os

private let L = Logger(subsystem: "world.hyly.keyboards.spike", category: "kb")

final class KeyboardViewController: UIInputViewController {
    private let label = UILabel()
    private var browser: NWBrowser?
    private var conn: NWConnection?
    private var buf = Data()
    private var lat: [Double] = []
    private let tag = String(UUID().uuidString.prefix(4))

    override func viewDidLoad() {
        super.viewDidLoad()
        label.numberOfLines = 0; label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            view.heightAnchor.constraint(equalToConstant: 160)])
        show("init fullAccess=\(hasFullAccess)")
        L.notice("[\(self.tag)] viewDidLoad hasFullAccess=\(self.hasFullAccess)")
    }
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        L.notice("[\(self.tag)] viewWillAppear fullAccess=\(self.hasFullAccess) conn=\(String(describing: self.conn?.state))")
        if browser == nil { startBrowse() }
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        L.notice("[\(self.tag)] viewDidDisappear conn=\(String(describing: self.conn?.state))")
    }
    func show(_ s: String) { DispatchQueue.main.async { self.label.text = s } }

    func startBrowse() {
        let p = NWParameters(); p.includePeerToPeer = true
        let b = NWBrowser(for: .bonjour(type: "_ukeys._tcp", domain: nil), using: p)
        b.stateUpdateHandler = { st in L.notice("[\(self.tag)] browser state \(String(describing: st))"); self.show("browser \(st)") }
        b.browseResultsChangedHandler = { res, _ in
            L.notice("[\(self.tag)] browse results \(res.count)")
            guard self.conn == nil, let r = res.first else { return }
            self.connect(r.endpoint)
        }
        b.start(queue: .main); browser = b
    }
    func connect(_ ep: NWEndpoint) {
        let c = NWConnection(to: ep, using: .tcp)
        c.stateUpdateHandler = { st in
            L.notice("[\(self.tag)] conn state \(String(describing: st))")
            self.show("conn \(st)")
            switch st { case .failed, .cancelled: self.conn = nil; default: break }
        }
        c.start(queue: .main); conn = c; recv(c)
    }
    func recv(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { d, _, done, e in
            if let d { self.buf.append(d); self.drain() }
            if done || e != nil { L.notice("[\(self.tag)] recv end \(String(describing: e))"); self.conn = nil; return }
            self.recv(c)
        }
    }
    func drain() {
        while let i = buf.firstIndex(of: 0x0A) {
            let line = buf.subdata(in: buf.startIndex..<i); buf.removeSubrange(buf.startIndex...i)
            guard let o = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
            apply(o)
        }
    }
    func apply(_ o: [String: Any]) {
        let op = o["op"] as? String ?? "insert", text = o["text"] as? String ?? ""
        let seq = o["seq"] as? Int ?? 0, ts = o["ts"] as? Double ?? 0
        let p = textDocumentProxy
        switch op {
        case "delete": p.deleteBackward()
        case "mark": p.setMarkedText(text, selectedRange: NSRange(location: text.utf16.count, length: 0))
        case "unmark": p.unmarkText()
        case "move": p.adjustTextPosition(byCharacterOffset: o["n"] as? Int ?? 0)
        default: p.insertText(text)
        }
        let ms = Date().timeIntervalSince1970 * 1000 - ts
        lat.append(ms)
        L.notice("[\(self.tag)] applied seq=\(seq) op=\(op) latency_ms=\(ms, format: .fixed(precision: 2)) ctx=\(p.documentContextBeforeInput ?? "nil", privacy: .public)")
        if lat.count % 50 == 0 {
            let s = lat.suffix(50).sorted()
            L.notice("[\(self.tag)] median50_ms=\(s[25], format: .fixed(precision: 2)) max=\(s[49], format: .fixed(precision: 2))")
        }
        show("last seq \(seq) \(op) \(String(format: "%.1f", ms)) ms")
    }
}
