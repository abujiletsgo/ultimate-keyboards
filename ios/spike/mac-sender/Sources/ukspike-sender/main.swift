import Foundation
import Network

// stdin lines: plain text -> insert; "/del" deleteBackward; "/mark xx" setMarkedText; "/unmark";
// "/move N" adjustTextPosition; "/bench" 50 frames at 50 ms.
let params = NWParameters.tcp
params.includePeerToPeer = true
if CommandLine.arguments.contains("--loopback") { params.requiredInterfaceType = .loopback }
let listener = try NWListener(using: params)
listener.service = NWListener.Service(name: "UK Spike Mac", type: "_ukeys._tcp")
var conn: NWConnection?
var seq = 0
func log(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

func send(_ op: String, _ text: String = "", _ n: Int = 0) {
    guard let c = conn else { log("no connection"); return }
    seq += 1
    let ts = Date().timeIntervalSince1970 * 1000
    let obj: [String: Any] = ["seq": seq, "op": op, "text": text, "n": n, "ts": ts]
    var d = try! JSONSerialization.data(withJSONObject: obj)
    d.append(0x0A)
    c.send(content: d, completion: .contentProcessed { e in if let e { log("send err \(e)") } })
}
func accept(_ c: NWConnection) {
    conn?.cancel(); conn = c
    c.stateUpdateHandler = { log("conn state \($0)") }
    c.start(queue: .main)
    func rd() { c.receive(minimumIncompleteLength: 1, maximumLength: 4096) { d, _, done, e in
        if let d, let s = String(data: d, encoding: .utf8) { log("from phone: \(s)") }
        if done || e != nil { return }; rd() } }
    rd()
}
listener.stateUpdateHandler = { log("listener \($0)") }
listener.newConnectionHandler = { log("new connection from \($0.endpoint)"); accept($0) }
listener.start(queue: .main)

DispatchQueue.global().async {
    while let line = readLine() {
        DispatchQueue.main.sync {
            if line == "/del" { send("delete") }
            else if line.hasPrefix("/mark ") { send("mark", String(line.dropFirst(6))) }
            else if line == "/unmark" { send("unmark") }
            else if line.hasPrefix("/move ") { send("move", "", Int(line.dropFirst(6)) ?? 0) }
            else if line == "/bench" {
                for i in 0..<50 { DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.05) { send("insert", "x") } }
            }
            else { send("insert", line) }
        }
    }
    // stdin closed: linger so queued frames flush
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { exit(0) }
}
dispatchMain()
