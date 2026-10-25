import Foundation

enum Metric: String, CaseIterable {
    case socAverage
    case socMax
    case hottest
    case battery

    var title: String {
        switch self {
        case .socAverage: return "SoC 평균"
        case .socMax: return "SoC 최대"
        case .hottest: return "전체 최고"
        case .battery: return "배터리"
        }
    }

    /// 메뉴바 숫자를 계산하는 데 실제로 필요한 그룹. nil 이면 전체 센서가 필요하다.
    var requiredGroups: Set<SensorGroup>? {
        switch self {
        case .socAverage, .socMax: return [.soc]
        case .battery: return [.battery]
        case .hottest: return nil
        }
    }

    func value(from readings: [SensorReading]) -> Double? {
        switch self {
        case .socAverage: return readings.average(in: .soc)
        case .socMax: return readings.maximum(in: .soc)
        case .hottest: return readings.hottest
        case .battery: return readings.average(in: .battery)
        }
    }
}

enum TemperatureUnit: String, CaseIterable {
    case celsius
    case fahrenheit

    var title: String { self == .celsius ? "섭씨 (°C)" : "화씨 (°F)" }
    var suffix: String { self == .celsius ? "°C" : "°F" }

    func convert(_ celsius: Double) -> Double {
        self == .celsius ? celsius : celsius * 9 / 5 + 32
    }
}

/// UserDefaults 로 유지되는 사용자 설정.
enum Preferences {
    private static let defaults = UserDefaults.standard

    static let refreshIntervals: [TimeInterval] = [1, 2, 5, 10]

    /// 메뉴바 온도가 주황색으로 바뀌는 기준 (섭씨).
    static let warningCelsius: Double = 80
    /// 메뉴바 온도가 빨간색으로 바뀌는 기준 (섭씨).
    static let criticalCelsius: Double = 95

    static var metric: Metric {
        get { Metric(rawValue: defaults.string(forKey: "metric") ?? "") ?? .socAverage }
        set { defaults.set(newValue.rawValue, forKey: "metric") }
    }

    static var unit: TemperatureUnit {
        get { TemperatureUnit(rawValue: defaults.string(forKey: "unit") ?? "") ?? .celsius }
        set { defaults.set(newValue.rawValue, forKey: "unit") }
    }

    static var refreshInterval: TimeInterval {
        get {
            let stored = defaults.double(forKey: "refreshInterval")
            return refreshIntervals.contains(stored) ? stored : 2
        }
        set { defaults.set(newValue, forKey: "refreshInterval") }
    }

    static var showUnitInMenuBar: Bool {
        get { defaults.object(forKey: "showUnitInMenuBar") as? Bool ?? false }
        set { defaults.set(newValue, forKey: "showUnitInMenuBar") }
    }
}
