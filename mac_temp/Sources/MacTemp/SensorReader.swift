import Foundation

enum SensorGroup: Int, CaseIterable {
    case soc
    case battery
    case storage
    case board
    case other

    var title: String {
        switch self {
        case .soc: return "SoC (칩)"
        case .battery: return "배터리"
        case .storage: return "저장장치"
        case .board: return "보드·주변부"
        case .other: return "기타"
        }
    }

    /// 센서 이름으로 분류한다.
    /// M2/M3 계열은 "PMU tdieN"(다이 온도) / "PMU tdevN"(주변부) 형태로 올라온다.
    static func classify(_ name: String) -> SensorGroup {
        let n = name.lowercased()
        if n.contains("battery") || n.contains("gas gauge") { return .battery }
        if n.contains("nand") || n.contains("ssd") || n.contains("nvme") { return .storage }
        if n.contains("tdie") || n.contains("tcal") || n.contains("soc")
            || n.contains("gpu") || n.contains("cpu") || n.contains("acc")
            || n.contains("mtr temp") { return .soc }
        if n.contains("tdev") { return .board }
        return .other
    }
}

struct SensorReading {
    let name: String
    let celsius: Double
    let group: SensorGroup
}

/// 온도 센서를 주기적으로 읽는다. 서비스 목록은 캐시하고 가끔씩만 다시 조회한다.
final class SensorReader {
    private var client: AnyObject?
    private var services: [AnyObject] = []
    private var names: [String] = []
    private var groups: [SensorGroup] = []
    private var lastEnumeration: Date = .distantPast

    private let reenumerationInterval: TimeInterval = 60

    var sensorCount: Int { services.count }

    /// 센서 하나를 읽는 데 CPU 자체는 얼마 안 쓰지만 HID 데몬 응답을 기다리느라
    /// 호출당 1ms 가까이 블로킹된다. 그래서 필요한 그룹만 읽을 수 있게 해 둔다.
    /// - Parameter groups: nil 이면 전체.
    func read(groups wanted: Set<SensorGroup>? = nil) -> [SensorReading] {
        enumerateIfNeeded()

        var readings: [SensorReading] = []
        readings.reserveCapacity(services.count)
        for (index, service) in services.enumerated() {
            if let wanted, !wanted.contains(groups[index]) { continue }
            guard let celsius = HID.celsius(of: service) else { continue }
            readings.append(SensorReading(name: names[index], celsius: celsius, group: groups[index]))
        }

        // 전체를 읽었는데도 값이 하나도 없으면 서비스 핸들이 죽은 것으로 보고 다음 틱에 다시 조회한다.
        // (일부 그룹만 읽은 경우엔 그 그룹에 센서가 없을 뿐이므로 재조회하지 않는다.)
        if readings.isEmpty, wanted == nil { lastEnumeration = .distantPast }
        return readings
    }

    private func enumerateIfNeeded() {
        guard Date().timeIntervalSince(lastEnumeration) > reenumerationInterval else { return }
        lastEnumeration = Date()

        guard let result = HID.temperatureServices() else { return }
        client = result.client
        services = result.services

        // 같은 이름의 센서가 여러 개 있으므로 표시용 이름에 번호를 붙인다.
        var seen: [String: Int] = [:]
        names = services.map { service in
            let raw = HID.productName(of: service) ?? "알 수 없는 센서"
            let count = (seen[raw] ?? 0) + 1
            seen[raw] = count
            return count == 1 ? raw : "\(raw) #\(count)"
        }
        groups = names.map { SensorGroup.classify($0) }
    }
}

extension Array where Element == SensorReading {
    func average(in group: SensorGroup) -> Double? {
        let values = filter { $0.group == group }.map(\.celsius)
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / Double(values.count)
    }

    func maximum(in group: SensorGroup) -> Double? {
        filter { $0.group == group }.map(\.celsius).max()
    }

    var hottest: Double? { map(\.celsius).max() }
}
