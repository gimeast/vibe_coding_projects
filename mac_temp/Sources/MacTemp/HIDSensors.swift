import Foundation

// Apple Silicon 은 예전 인텔 맥의 SMC 온도 키를 제공하지 않는다.
// 대신 IOKit 의 HID 이벤트 시스템에 온도 센서가 서비스로 올라와 있고,
// 아래 심볼들은 IOKit.framework 가 export 하지만 공개 헤더에는 없다.
// (권한/sudo 없이 읽기 가능. powermetrics 와 달리 루트가 필요 없다.)

@_silgen_name("IOHIDEventSystemClientCreate")
private func _IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> Unmanaged<AnyObject>?

@_silgen_name("IOHIDEventSystemClientSetMatching")
private func _IOHIDEventSystemClientSetMatching(_ client: AnyObject?, _ match: CFDictionary?) -> Int32

@_silgen_name("IOHIDEventSystemClientCopyServices")
private func _IOHIDEventSystemClientCopyServices(_ client: AnyObject?) -> Unmanaged<CFArray>?

@_silgen_name("IOHIDServiceClientCopyProperty")
private func _IOHIDServiceClientCopyProperty(_ service: AnyObject?, _ key: CFString) -> Unmanaged<AnyObject>?

@_silgen_name("IOHIDServiceClientCopyEvent")
private func _IOHIDServiceClientCopyEvent(_ service: AnyObject?, _ type: Int64, _ options: Int32, _ timestamp: Int64) -> Unmanaged<AnyObject>?

@_silgen_name("IOHIDEventGetFloatValue")
private func _IOHIDEventGetFloatValue(_ event: AnyObject?, _ field: Int32) -> Double

enum HID {
    private static let appleVendorPage = 0xff00
    private static let temperatureSensorUsage = 0x0005
    private static let eventTypeTemperature: Int64 = 15
    /// IOHIDEventFieldBase(kIOHIDEventTypeTemperature)
    private static let temperatureField = Int32(truncatingIfNeeded: eventTypeTemperature << 16)

    /// 온도 센서 서비스 목록을 새로 조회한다. 클라이언트는 서비스가 살아있는 동안 유지해야 한다.
    static func temperatureServices() -> (client: AnyObject, services: [AnyObject])? {
        guard let clientRef = _IOHIDEventSystemClientCreate(kCFAllocatorDefault) else { return nil }
        let client = clientRef.takeRetainedValue()

        let match: [String: Any] = [
            "PrimaryUsagePage": appleVendorPage,
            "PrimaryUsage": temperatureSensorUsage,
        ]
        _ = _IOHIDEventSystemClientSetMatching(client, match as CFDictionary)

        guard let servicesRef = _IOHIDEventSystemClientCopyServices(client) else { return nil }
        let services = servicesRef.takeRetainedValue() as [AnyObject]
        return (client, services)
    }

    static func productName(of service: AnyObject) -> String? {
        _IOHIDServiceClientCopyProperty(service, "Product" as CFString)?.takeRetainedValue() as? String
    }

    /// 섭씨 온도. 값을 읽을 수 없는 센서면 nil.
    static func celsius(of service: AnyObject) -> Double? {
        guard let eventRef = _IOHIDServiceClientCopyEvent(service, eventTypeTemperature, 0, 0) else { return nil }
        let event = eventRef.takeRetainedValue()
        let value = _IOHIDEventGetFloatValue(event, temperatureField)
        // 비활성 센서는 0 또는 비정상값을 돌려준다.
        guard value.isFinite, value > 0, value < 200 else { return nil }
        return value
    }
}
