import AppKit
import ServiceManagement

final class StatusItemController: NSObject, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let menu = NSMenu()

    /// 센서 읽기는 HID 데몬 응답을 기다리느라 수십 ms 블로킹된다. 메인 스레드에서 하면
    /// 그만큼 UI 가 멈추므로 전용 시리얼 큐에서만 만진다.
    private let reader = SensorReader()
    private let sensorQueue = DispatchQueue(label: "com.gimeast.mactemp.sensors", qos: .utility)

    private var timer: Timer?
    private var readings: [SensorReading] = []

    private var isMenuOpen = false
    /// 메뉴가 열려 있는 동안 값만 갈아끼우기 위한 항목 참조.
    private var groupRows: [SensorGroup: NSMenuItem] = [:]
    private var sensorRows: [String: NSMenuItem] = [:]

    override init() {
        super.init()

        if let button = statusItem.button {
            button.image = NSImage(
                systemSymbolName: "thermometer.medium",
                accessibilityDescription: "온도"
            )
            button.image?.isTemplate = true
            button.imagePosition = .imageLeading
        }

        menu.delegate = self
        statusItem.menu = menu

        refresh()
        restartTimer()
    }

    deinit {
        timer?.invalidate()
    }

    // MARK: - 갱신

    private func restartTimer() {
        timer?.invalidate()
        let timer = Timer(timeInterval: Preferences.refreshInterval, repeats: true) { [weak self] _ in
            guard let self else { return }
            // 메뉴가 열려 있을 때만 전체 센서를 읽는다.
            self.refresh(full: self.isMenuOpen)
        }
        // .common 모드라 메뉴가 열려 있는 동안에도 값이 계속 갱신된다.
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    /// 메뉴가 닫혀 있으면 메뉴바 숫자에 필요한 그룹만 읽어서 깨우는 일을 줄인다.
    private func refresh(full: Bool = false) {
        let wanted = full ? nil : Preferences.metric.requiredGroups
        sensorQueue.async { [weak self] in
            guard let self else { return }
            let readings = self.reader.read(groups: wanted)
            DispatchQueue.main.async {
                self.readings = readings
                self.updateTitle()
                // 열려 있는 메뉴를 통째로 다시 만들면 깜빡이므로 값만 갈아끼운다.
                if self.isMenuOpen { self.updateMenuValues() }
            }
        }
    }

    private func updateTitle() {
        guard let button = statusItem.button else { return }

        guard let celsius = Preferences.metric.value(from: readings) else {
            button.attributedTitle = NSAttributedString(
                string: " —",
                attributes: [.font: Self.titleFont, .foregroundColor: NSColor.labelColor]
            )
            return
        }

        let unit = Preferences.unit
        let shown = unit.convert(celsius)
        let text = Preferences.showUnitInMenuBar
            ? String(format: " %.0f%@", shown, unit.suffix)
            : String(format: " %.0f°", shown)

        button.attributedTitle = NSAttributedString(
            string: text,
            attributes: [.font: Self.titleFont, .foregroundColor: Self.color(forCelsius: celsius)]
        )
        button.toolTip = String(
            format: "%@: %.1f%@", Preferences.metric.title, shown, unit.suffix
        )
    }

    private static let titleFont = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium)

    private static func color(forCelsius celsius: Double) -> NSColor {
        if celsius >= Preferences.criticalCelsius { return .systemRed }
        if celsius >= Preferences.warningCelsius { return .systemOrange }
        return .labelColor
    }

    // MARK: - 메뉴

    func menuWillOpen(_ menu: NSMenu) {
        // 메뉴를 그리려면 값이 지금 있어야 하므로 여기서만 동기로 읽는다.
        // 사용자가 방금 클릭한 시점이라 수십 ms 지연은 드러나지 않는다.
        readings = sensorQueue.sync { reader.read() }
        updateTitle()
        rebuildMenu()
        isMenuOpen = true
    }

    func menuDidClose(_ menu: NSMenu) {
        isMenuOpen = false
    }

    /// 메뉴를 열어둔 채로 값만 갱신한다. 센서 구성이 바뀌었으면 다음 열 때 반영된다.
    private func updateMenuValues() {
        for (group, row) in groupRows {
            guard let summary = groupSummary(for: group) else { continue }
            setReadout(row, name: group.title, value: summary)
        }
        for reading in readings {
            guard let row = sensorRows[reading.name] else { continue }
            setReadout(row, name: "   " + reading.name, value: format(reading.celsius))
        }
    }

    private func groupSummary(for group: SensorGroup) -> String? {
        let inGroup = readings.filter { $0.group == group }
        guard !inGroup.isEmpty else { return nil }
        let average = inGroup.map(\.celsius).reduce(0, +) / Double(inGroup.count)
        let maximum = inGroup.map(\.celsius).max() ?? average
        return inGroup.count > 1
            ? String(format: "%@ / 최대 %@", format(average), format(maximum))
            : format(average)
    }

    private func rebuildMenu() {
        menu.removeAllItems()
        groupRows.removeAll()
        sensorRows.removeAll()

        if readings.isEmpty {
            menu.addItem(disabledItem("온도 센서를 읽을 수 없습니다"))
        } else {
            for group in SensorGroup.allCases {
                guard let summary = groupSummary(for: group) else { continue }
                let row = readoutItem(group.title, summary)
                groupRows[group] = row
                menu.addItem(row)
            }
        }

        menu.addItem(.separator())
        menu.addItem(allSensorsItem())

        menu.addItem(.separator())
        menu.addItem(metricItem())
        menu.addItem(unitItem())
        menu.addItem(intervalItem())

        let launchItem = NSMenuItem(
            title: "로그인 시 자동 실행",
            action: #selector(toggleLaunchAtLogin),
            keyEquivalent: ""
        )
        launchItem.target = self
        launchItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(launchItem)

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "MacTemp 종료", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
    }

    private func allSensorsItem() -> NSMenuItem {
        let item = NSMenuItem(title: "모든 센서 (\(readings.count)개)", action: nil, keyEquivalent: "")
        let submenu = NSMenu()

        for group in SensorGroup.allCases {
            let inGroup = readings.filter { $0.group == group }.sorted { $0.celsius > $1.celsius }
            guard !inGroup.isEmpty else { continue }
            let header = disabledItem(group.title)
            header.attributedTitle = NSAttributedString(
                string: group.title,
                attributes: [
                    .font: NSFont.systemFont(ofSize: NSFont.smallSystemFontSize, weight: .semibold),
                    .foregroundColor: NSColor.secondaryLabelColor,
                ]
            )
            submenu.addItem(header)
            for reading in inGroup {
                let row = readoutItem("   " + reading.name, format(reading.celsius))
                sensorRows[reading.name] = row
                submenu.addItem(row)
            }
            submenu.addItem(.separator())
        }
        if submenu.numberOfItems > 0 { submenu.removeItem(at: submenu.numberOfItems - 1) }

        item.submenu = submenu
        return item
    }

    private func metricItem() -> NSMenuItem {
        let item = NSMenuItem(title: "메뉴바 표시 항목", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        for metric in Metric.allCases {
            let entry = NSMenuItem(title: metric.title, action: #selector(selectMetric(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = metric.rawValue
            entry.state = Preferences.metric == metric ? .on : .off
            submenu.addItem(entry)
        }
        item.submenu = submenu
        return item
    }

    private func unitItem() -> NSMenuItem {
        let item = NSMenuItem(title: "단위", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        for unit in TemperatureUnit.allCases {
            let entry = NSMenuItem(title: unit.title, action: #selector(selectUnit(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = unit.rawValue
            entry.state = Preferences.unit == unit ? .on : .off
            submenu.addItem(entry)
        }
        submenu.addItem(.separator())
        let showUnit = NSMenuItem(
            title: "메뉴바에 단위 표시",
            action: #selector(toggleShowUnit),
            keyEquivalent: ""
        )
        showUnit.target = self
        showUnit.state = Preferences.showUnitInMenuBar ? .on : .off
        submenu.addItem(showUnit)
        item.submenu = submenu
        return item
    }

    private func intervalItem() -> NSMenuItem {
        let item = NSMenuItem(title: "갱신 주기", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        for interval in Preferences.refreshIntervals {
            let entry = NSMenuItem(
                title: String(format: "%.0f초", interval),
                action: #selector(selectInterval(_:)),
                keyEquivalent: ""
            )
            entry.target = self
            entry.representedObject = interval
            entry.state = Preferences.refreshInterval == interval ? .on : .off
            submenu.addItem(entry)
        }
        item.submenu = submenu
        return item
    }

    // MARK: - 메뉴 항목 조립

    private func format(_ celsius: Double) -> String {
        let unit = Preferences.unit
        return String(format: "%.1f%@", unit.convert(celsius), unit.suffix)
    }

    private func disabledItem(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    /// 이름은 왼쪽, 값은 탭 스톱에 맞춰 오른쪽 정렬한 읽기 전용 항목.
    private func readoutItem(_ name: String, _ value: String) -> NSMenuItem {
        let item = NSMenuItem(title: name, action: nil, keyEquivalent: "")
        item.isEnabled = false
        setReadout(item, name: name, value: value)
        return item
    }

    private func setReadout(_ item: NSMenuItem, name: String, value: String) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.tabStops = [NSTextTab(textAlignment: .right, location: 230)]

        item.attributedTitle = NSAttributedString(
            string: "\(name)\t\(value)",
            attributes: [
                .font: NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular),
                .paragraphStyle: paragraph,
                .foregroundColor: NSColor.labelColor,
            ]
        )
    }

    // MARK: - 액션

    @objc private func selectMetric(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let metric = Metric(rawValue: raw) else { return }
        Preferences.metric = metric
        updateTitle()
    }

    @objc private func selectUnit(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let unit = TemperatureUnit(rawValue: raw) else { return }
        Preferences.unit = unit
        updateTitle()
    }

    @objc private func toggleShowUnit() {
        Preferences.showUnitInMenuBar.toggle()
        updateTitle()
    }

    @objc private func selectInterval(_ sender: NSMenuItem) {
        guard let interval = sender.representedObject as? TimeInterval else { return }
        Preferences.refreshInterval = interval
        restartTimer()
    }

    @objc private func toggleLaunchAtLogin() {
        let service = SMAppService.mainApp
        do {
            if service.status == .enabled {
                try service.unregister()
            } else {
                try service.register()
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = "자동 실행 설정을 변경하지 못했습니다"
            alert.informativeText = """
            \(error.localizedDescription)

            앱이 /Applications 안에 있어야 등록이 됩니다. \
            시스템 설정 > 일반 > 로그인 항목에서 직접 추가할 수도 있습니다.
            """
            alert.alertStyle = .warning
            alert.runModal()
        }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
