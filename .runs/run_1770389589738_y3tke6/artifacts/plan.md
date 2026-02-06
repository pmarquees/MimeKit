# Plan: todaylastyear Implementation Blueprint

## TL;DR
- Goal: iOS weather comparison app built in Swift/SwiftUI that displays current weather alongside conditions from exactly one year ago, with daily and weekly temperature comparisons at user's GPS location.
- Recommended approach: incremental implementation aligned to existing architecture boundaries and route-level layout fidelity.
- This plan is intentionally concise on context and verbose on implementation details, design fidelity, and UI behavior.

## Phase 1: Initial Understanding
### Repository Context
- Repository: `pmarquees/todaylastyear`
- Branch analyzed: `main`
- Scan mode: `deep` | sampled files: 3 | token estimate: 3243
- Target agent: `claude-code`

### Key Files Inspected
- `README.md` - project readme
- `todaylastyear/ContentView.swift` - large source sample
- `todaylastyear/todaylastyearApp.swift` - large source sample

### Confirmed Stack + Architecture Signals
- Frontend: Not detected
- Backend: Not detected
- Database: Not detected
- Auth: Not detected
- Infrastructure: Not detected
- Language: Swift

- ContentView (Main UI component displaying weather comparison between today and last year) -> SwiftUI, Swift
- WeatherViewModel (View model managing weather data fetching and state) -> Swift, CoreLocation
- Location Service (Handles device location requests and coordinate retrieval) -> CoreLocation, Swift
- Weather API (External weather data provider for current and historical data) -> HTTP, REST API
- TemperatureView (Reusable component displaying temperature values) -> SwiftUI
- WeatherInfoView (Reusable component displaying weather metrics like wind, humidity, visibility) -> SwiftUI

## Phase 2: Design
### Requirements and Constraints
- Location permission must be granted before any weather data fetch; show permission prompt on first launch
- Temperature comparison always uses date exactly 365 days prior to current date
- If either currentTemperature or lastYearTemperature is nil, do not show daily summary
- Wind speed displayed in km/h, temperature in Celsius with degree symbol
- Date formatting: weekday (e.g. 'Monday'), day number, month name (e.g. 'January')
- Tab state persists during session but resets on app relaunch
- Refresh weather data if user pulls to refresh or app returns from background after 10+ minutes
- iOS 15+ required for async/await in WeatherAPI service
- CoreLocation framework for GPS; user must grant location permission
- External weather API must provide historical data for past dates; API key and endpoint TBD
- Network connectivity required; no offline mode in initial version
- Temperature values in Celsius; no unit conversion in v1

### Route Blueprints (Layout + Interaction Fidelity)
### `Today Tab`
- Purpose: Display current weather and last year comparison with daily summary
- Layout: Vertical scroll: top section with location name and date, dual temperature cards (current/last year) side-by-side, daily summary text below, bottom grid of weather metrics (wind/humidity/visibility) with icons
- Components: LocationHeader, TemperatureView, DailySummaryText, WeatherInfoView
- Functionality logic: Fetch location on appear | Load current weather and last year data | Generate summary comparing temps | Show loading state until both data sets available

### `Last 7 Days Tab`
- Purpose: Show weekly temperature comparison list
- Layout: Vertical list of 7 rows, each row showing formatted date on left, current temp and last year temp side-by-side on right, with subtle dividers between rows
- Components: WeeklyComparisonRow, TemperatureLabel
- Functionality logic: Fetch weekly data for past 7 days | Display each day with current vs last year temps | Format dates as weekday, day, month | Maintain scroll position

### Module + Interface Implementation Plan
#### Modules
- ContentView.swift - Main UI with TabView
- WeatherViewModel.swift - Observable state manager with @Published properties
- LocationService.swift - CoreLocation wrapper with CLLocationManager
- WeatherAPI.swift - HTTP service for current and historical weather data
- TemperatureView.swift - Reusable temperature display component
- WeatherInfoView.swift - Reusable metric display with icon/value/title
- WeatherModel.swift - Data models for weather response
- DateExtensions.swift - Date formatting utilities

#### Functionality logic
- On launch, request location permission and fetch coordinates via CoreLocation
- Pass coordinates to WeatherAPI to fetch current weather and weather from 365 days prior
- Populate currentTemperature and lastYearTemperature optional Doubles in ViewModel
- Generate daily summary string comparing temps: 'X degrees hotter/colder/the same than last year'
- For weekly view, fetch 7 data points (today minus 0-6 days) with current and last year temps for each
- Update @Published properties to trigger SwiftUI view refresh
- Display loading state when isLoading is true, error state if location or API fails
- Tab selection state tracked with @State selectedTab Int (0=Today, 1=Last 7 Days)

#### Interfaces
- WeatherViewModel: @Published currentTemperature: Double?, lastYearTemperature: Double?, currentWeather: WeatherData?, locationName: String?, weeklyComparison: [DayComparison], isLoading: Bool
- LocationService: func requestLocation() -> Coordinates?, requestPermission()
- WeatherAPI: func fetchCurrentWeather(coordinates: Coordinates) async throws -> WeatherData, func fetchHistoricalWeather(coordinates: Coordinates, date: Date) async throws -> WeatherData
- WeatherData struct: temperature: Double, description: String, windSpeed: Double, humidity: Double, visibility: Double
- DayComparison struct: date: Date, dateFormatted: String, currentTemp: Double, lastYearTemp: Double

### Data + Database Design
#### Data Models (Priority Set)
- WeatherData: temperature, description, windSpeed, humidity, visibility, all Doubles except description String
- DayComparison: date as Date, dateFormatted as String, currentTemp and lastYearTemp as Doubles
- Coordinates: latitude and longitude as Doubles from CoreLocation CLLocationCoordinate2D

#### Database design
- No local database; all weather data fetched from external API on demand
- Optional future enhancement: cache weather responses in UserDefaults or CoreData to support offline viewing

### Design System (Detailed, Implementable)
#### Visual Direction
- Clean iOS weather app with card-based layout, prominent temperature displays, and subtle metric grids; prioritizes readability and quick visual comparison.

#### Color Tokens (Use Exact Hex)
- Background: `#F8FAFC`
- Surface: `#FFFFFF` | Surface Alt: `#EEF2F7`
- Text: `#111827` | Muted Text: `#6B7280`
- Border: `#D1D5DB`
- Primary: `#2563EB` | Primary Hover: `#1D4ED8`
- Accent: `#0EA5E9`
- Semantic: success `#16A34A`, warning `#D97706`, danger `#DC2626`

#### Typography + Radius
- Large temperature values: .system(size: 48, weight: .bold)
- Location/date headers: .system(size: 18, weight: .semibold)
- Body text and labels: .system(size: 16, weight: .regular)
- Radius scale: sm=8px, md=12px, lg=16px, xl=24px

#### Button and Component Styling Contract
- Primary buttons: filled style with strong contrast text, subtle lift on hover, and medium radius.
- Secondary buttons: bordered surface-alt background with same vertical rhythm as primary buttons.
- Ghost buttons: low-emphasis text style for tertiary actions without losing focus states.
- Cards and panels: thin border, medium-to-large radius, and restrained elevation to maintain dense information layout.
- Inputs: surface-alt background, explicit border, and predictable focus ring behavior.

#### Layout + Positioning Contract
- Keep top-level navigation and page actions visible without introducing heavy shell changes.

#### Motion + Interaction
- Default iOS spring animations for tab switching
- Fade in weather data when loaded with .animation(.easeIn(duration: 0.3))
- No custom transitions; rely on SwiftUI implicit animations for state changes
- Use short, purposeful transitions only where state change needs emphasis.

#### CSS Blueprint (Reference Implementation)
```css
:root {
  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-alt: #EEF2F7;
  --color-text: #111827;
  --color-text-muted: #6B7280;
  --color-border: #D1D5DB;
  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-accent: #0EA5E9;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
}

.btn-primary {
  border: 1px solid transparent;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-weight: 600;
  transition: transform 120ms ease, background-color 120ms ease;
}
.btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); }
.btn-secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  color: var(--color-text);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}
.btn-ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}
.app-shell { min-height: 100vh; background: var(--color-bg); }
.app-header { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--color-border); background: var(--color-surface); }
.action-cluster { display: inline-flex; gap: 8px; align-items: center; }
.surface-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.input { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-alt); color: var(--color-text); }
@keyframes menu-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
```

## Phase 3: Review
### Alignment Checklist
- Each user-facing route has explicit purpose, layout, component plan, and functionality logic.
- Layout fidelity is preserved (floating menus, sticky headers, command palettes, shell pattern) from source signals.
- Behavior rules map to enforceable logic paths and interface contracts.
- Data contracts are reflected in data models and database/index/migration guidance.
- Design system tokens and distinctive UI traits are consistently applied across routes.

### Assumptions to Confirm
- User will grant location permissions to the app
- Weather API provides reliable historical data for one year ago
- Device has active internet connection for weather data fetching
- Weather API returns data in Celsius or values are converted to Celsius
- Historical weather data is available for all locations
- Humidity value of 48% and visibility of 1.6km appear to be placeholder values

### Risks and Edge Cases
- Unknown to validate: Which specific weather API service is being used
- Unknown to validate: How weather data is cached or refreshed
- Unknown to validate: Authentication requirements for weather API
- Unknown to validate: Error handling for failed API requests
- Unknown to validate: Behavior when location services are denied
- Unknown to validate: How frequently weather data is updated
- Scope boundary: No user authentication or multi-user profiles
- Scope boundary: No weather alerts or push notifications

## Phase 4: Final Plan
### Recommended Approach
- Implement the plan as a single coherent approach (no parallel competing implementations).
- Follow the ordered steps below; preserve interaction and visual behavior before introducing structural changes.

### Implementation Steps
1. Create Xcode SwiftUI project with CoreLocation and network entitlements; add Info.plist location usage description
2. Implement LocationService with CLLocationManager, request permission, and return coordinates as Coordinates struct
3. Build WeatherAPI service with async methods fetchCurrentWeather and fetchHistoricalWeather using URLSession; decode JSON to WeatherData
4. Create WeatherViewModel as ObservableObject with @Published properties; add methods to fetch location, call API, and populate current/lastYear temps
5. Build TemperatureView and WeatherInfoView reusable components with title, value, and optional icon parameters
6. Implement ContentView with TabView containing Today and Last 7 Days tabs; bind to WeatherViewModel
7. In Today tab, layout LocationHeader, HStack of two TemperatureViews, daily summary Text, LazyVGrid of WeatherInfoViews for wind/humidity/visibility
8. In Last 7 Days tab, use List with ForEach over weeklyComparison array; each row displays dateFormatted, currentTemp, lastYearTemp
9. Add loading and error states with conditional rendering based on ViewModel isLoading and error properties
10. Test location permission flow, API calls with mock coordinates, and UI rendering with sample data; verify 365-day calculation and date formatting

### Testing
- Location permission prompt appears on first launch; coordinates returned after grant
- Current weather API call returns valid WeatherData with all fields populated
- Historical weather API call for date 365 days prior returns matching WeatherData structure
- Daily summary text correctly states 'hotter', 'colder', or 'the same' based on temp difference
- Weekly comparison list displays 7 rows with correctly formatted dates and temperature pairs
- Loading indicator shows while fetching data; disappears when data loads
- Error handling displays user-friendly message if API fails or location denied
- Tab switching preserves loaded data without refetching

### Rollout and Migration Notes
- No local database; all weather data fetched from external API on demand
- Optional future enhancement: cache weather responses in UserDefaults or CoreData to support offline viewing

## Implementation Prompt (LLM Ready)
```markdown
Implement pmarquees/todaylastyear using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
iOS weather comparison app built in Swift/SwiftUI that displays current weather alongside conditions from exactly one year ago, with daily and weekly temperature comparisons at user's GPS location.

## Route Fidelity Requirements
- Today Tab: Vertical scroll: top section with location name and date, dual temperature cards (current/last year) side-by-side, daily summary text below, bottom grid of weather metrics (wind/humidity/visibility) with icons Components: LocationHeader, TemperatureView, DailySummaryText, WeatherInfoView. Logic: Fetch location on appear | Load current weather and last year data | Generate summary comparing temps | Show loading state until both data sets available
- Last 7 Days Tab: Vertical list of 7 rows, each row showing formatted date on left, current temp and last year temp side-by-side on right, with subtle dividers between rows Components: WeeklyComparisonRow, TemperatureLabel. Logic: Fetch weekly data for past 7 days | Display each day with current vs last year temps | Format dates as weekday, day, month | Maintain scroll position

## Non-negotiable Rules
- Location permission must be granted before any weather data fetch; show permission prompt on first launch
- Temperature comparison always uses date exactly 365 days prior to current date
- If either currentTemperature or lastYearTemperature is nil, do not show daily summary
- Wind speed displayed in km/h, temperature in Celsius with degree symbol
- Date formatting: weekday (e.g. 'Monday'), day number, month name (e.g. 'January')
- Tab state persists during session but resets on app relaunch
- Refresh weather data if user pulls to refresh or app returns from background after 10+ minutes
- iOS 15+ required for async/await in WeatherAPI service
- CoreLocation framework for GPS; user must grant location permission
- External weather API must provide historical data for past dates; API key and endpoint TBD

## Build Order
1. Create Xcode SwiftUI project with CoreLocation and network entitlements; add Info.plist location usage description
2. Implement LocationService with CLLocationManager, request permission, and return coordinates as Coordinates struct
3. Build WeatherAPI service with async methods fetchCurrentWeather and fetchHistoricalWeather using URLSession; decode JSON to WeatherData
4. Create WeatherViewModel as ObservableObject with @Published properties; add methods to fetch location, call API, and populate current/lastYear temps
5. Build TemperatureView and WeatherInfoView reusable components with title, value, and optional icon parameters
6. Implement ContentView with TabView containing Today and Last 7 Days tabs; bind to WeatherViewModel
7. In Today tab, layout LocationHeader, HStack of two TemperatureViews, daily summary Text, LazyVGrid of WeatherInfoViews for wind/humidity/visibility
8. In Last 7 Days tab, use List with ForEach over weeklyComparison array; each row displays dateFormatted, currentTemp, lastYearTemp
9. Add loading and error states with conditional rendering based on ViewModel isLoading and error properties
10. Test location permission flow, API calls with mock coordinates, and UI rendering with sample data; verify 365-day calculation and date formatting

## Test Gates
- Location permission prompt appears on first launch; coordinates returned after grant
- Current weather API call returns valid WeatherData with all fields populated
- Historical weather API call for date 365 days prior returns matching WeatherData structure
- Daily summary text correctly states 'hotter', 'colder', or 'the same' based on temp difference
- Weekly comparison list displays 7 rows with correctly formatted dates and temperature pairs
- Loading indicator shows while fetching data; disappears when data loads
- Error handling displays user-friendly message if API fails or location denied
- Tab switching preserves loaded data without refetching
```