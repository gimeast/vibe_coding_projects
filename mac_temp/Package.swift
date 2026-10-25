// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "MacTemp",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "MacTemp",
            path: "Sources/MacTemp",
            swiftSettings: [.swiftLanguageMode(.v5)],
            linkerSettings: [
                .linkedFramework("IOKit"),
                .linkedFramework("AppKit"),
                .linkedFramework("ServiceManagement"),
            ]
        )
    ]
)
