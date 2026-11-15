// swift-tools-version:5.9
import PackageDescription
let package = Package(name: "ukspike-sender", platforms: [.macOS(.v13)],
  targets: [.executableTarget(name: "ukspike-sender", path: "Sources/ukspike-sender")])
