# Plan: todaylastyear Implementation Blueprint

## TL;DR
- Goal: iOS SwiftUI weather comparison app that displays current weather alongside same-date historical data from one year ago, with GPS-based location detection and tab-based navigation between daily and weekly comparison views.
- Recommended approach: incremental implementation aligned to existing architecture boundaries and route-level layout fidelity.
- This plan is intentionally concise on context and verbose on implementation details, design fidelity, and UI behavior.

## Phase 1: Initial Understanding
### Repository Context
- Repository: `pmarquees/todaylastyear`
- Branch analyzed: `main`
- Scan mode: `quick` | sampled files: 3 | token estimate: 3243
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

- ContentView (Main UI view displaying weather comparison between today and last year) -> SwiftUI
- WeatherViewModel (View model managing weather data and location state) -> Swift, Combine
- Location Service (Provides user's current GPS coordinates) -> CoreLocation
- Weather API (External weather data provider for current and historical data) -> HTTP API
- TemperatureView (UI component displaying individual temperature readings) -> SwiftUI
- WeatherInfoView (UI component displaying additional weather metrics) -> SwiftUI

## Phase 2: Design
### Requirements and Constraints
- Always request location permission before attempting weather fetch; do not proceed without coordinates
- Historical weather date must be exactly 365 days prior to current date for accurate year-over-year comparison
- Temperature comparison logic: if currentTemp > lastYearTemp use 'colder than', if currentTemp < lastYearTemp use 'hotter than', if equal use 'same as'
- Round all displayed temperatures to nearest integer or one decimal place for readability
- Weekly comparison always shows last 7 days in descending chronological order
- Date formatting must use 'EEEE, d MMMM' pattern (e.g., 'Monday, 15 January')
- Display wind speed in km/h and temperature in Celsius without unit conversion
- TabView selection must toggle between 0 (Today) and 1 (Weekly) with no other indices
- Show placeholder text ('Locating...', 'Loading...') until async operations complete
- Background opacity must be white at 0.2 for consistent translucent effect
- iOS 15.0+ minimum deployment target for SwiftUI and Combine support
- External weather API must provide both current and historical data endpoints with date parameters

### Route Blueprints (Layout + Interaction Fidelity)
### `Today Tab`
- Purpose: Primary view comparing today's weather to same date last year with temperature cards and daily summary.
- Layout: Vertical scroll view with white 0.2 opacity background. Top: location name, centered. Middle: two temperature cards side-by-side (current left, last year right), each with title, large temperature, and weather description. Below: WeatherInfoView row with wind/humidity/visibility icons. Bottom: daily summary text with temperature difference and comparison phrase.
- Components: NavigationStack, TabView, TemperatureView, WeatherInfoView, Text for location/summary
- Functionality logic: Fetch location on appear via CoreLocation | Pass coordinates to WeatherViewModel | Display 'Locating...' until location resolved | Show 'Loading...' in weather description until API returns | Calculate temp difference as current minus last year | Format comparison text: 'colder than' if current higher, 'hotter than' if lower, 'same as' if equal

### `Weekly Comparison Tab`
- Purpose: Seven-day scrollable list showing daily temperature comparisons between current week and same week last year.
- Layout: Vertical list with white 0.2 opacity background. Each row: date formatted as 'EEEE, d MMMM' left-aligned, current temperature center, last year temperature right, all horizontally arranged within rounded rectangle cards with padding.
- Components: TabView, List, HStack per row, Text for date/temps
- Functionality logic: Fetch 7 days of current and historical weather data | Display dates in descending order (most recent first) | Round temperatures to nearest integer | Use date as unique identifier for list items

### Module + Interface Implementation Plan
#### Modules
- ContentView.swift - Main UI with TabView and Today/Weekly tabs
- WeatherViewModel.swift - ObservableObject managing weather state, API calls, and data transformation
- TemperatureView.swift - Reusable component rendering title and temperature value
- WeatherInfoView.swift - Reusable component for icon + value + label metrics
- LocationService.swift - CoreLocation wrapper providing GPS coordinates
- WeatherAPIClient.swift - HTTP client for fetching current and historical weather data
- WeatherModels.swift - Codable structs for API responses and view state
- App.swift - SwiftUI App entry point with black accent color

#### Functionality logic
- On app launch, request location authorization via CoreLocation and display 'Locating...' placeholder
- Once coordinates received, trigger parallel API requests for current weather and historical weather from 365 days prior
- Parse API responses into currentWeather and lastYearWeather properties on WeatherViewModel
- Calculate temperature difference as currentTemperature - lastYearTemperature and format comparison string
- For weekly view, loop API requests for last 7 days and same dates last year, storing in weeklyComparison array with date/currentTemp/lastYearTemp objects
- Format dates using 'EEEE, d MMMM' pattern via DateFormatter
- Display wind speed in km/h, temperature in Celsius rounded to one decimal or integer
- Bind TabView selection state to toggle between index 0 (Today) and 1 (Weekly)
- Show loading states until all async operations complete, then render populated UI

#### Interfaces
- WeatherViewModel exposes @Published locationName: String?, currentTemperature: Double?, lastYearTemperature: Double?, currentWeather: WeatherData?, weeklyComparison: [WeeklyComparisonItem]
- WeatherData struct contains description: String, windspeed: Double
- WeeklyComparisonItem struct contains date: Date, dateFormatted: String, currentTemp: Double, lastYearTemp: Double
- LocationService provides requestLocation() -> AnyPublisher<CLLocationCoordinate2D, Error>
- WeatherAPIClient provides fetchCurrentWeather(lat: Double, lon: Double) and fetchHistoricalWeather(lat: Double, lon: Double, date: Date) returning async weather objects
- TemperatureView initializer: init(title: String, temperature: Double)
- WeatherInfoView initializer: init(iconName: String, value: String, title: String)

### Data + Database Design
#### Data Models (Priority Set)
- WeatherData: description (String), windspeed (Double), humidity (Int), visibility (Double)
- WeeklyComparisonItem: date (Date), dateFormatted (String), currentTemp (Double), lastYearTemp (Double)
- LocationCoordinate: latitude (Double), longitude (Double)
- WeatherAPIResponse (Codable): map external API JSON to internal WeatherData structure with temperature, description, wind, humidity, visibility fields

#### Database design
- No persistent database required; all weather data fetched on-demand from API
- Consider UserDefaults for caching last known location to reduce permission prompts
- Optional: cache last fetched weather data with timestamp for offline fallback display

### Design System (Detailed, Implementable)
#### Visual Direction
- Clean iOS-native weather app with white translucent backgrounds, bold black accents, and card-based information hierarchy. High readability with rounded corners and generous padding.

#### Color Tokens (Use Exact Hex)
- Background: `#F8FAFC`
- Surface: `#FFFFFF` | Surface Alt: `#EEF2F7`
- Text: `#111827` | Muted Text: `#6B7280`
- Border: `#D1D5DB`
- Primary: `#2563EB` | Primary Hover: `#1D4ED8`
- Accent: `#0EA5E9`
- Semantic: success `#16A34A`, warning `#D97706`, danger `#DC2626`

#### Typography + Radius
- System font (SF Pro) for all text
- Large title: 34pt bold for temperature values
- Headline: 17pt semibold for location and section titles
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
- Default SwiftUI spring animations for state transitions
- Fade-in animation when weather data loads
- Smooth tab switching with built-in TabView page curl or slide
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
- External weather API provides both current and historical data
- Weather API accepts date parameters for historical queries
- Users will grant location permissions for the app to function
- Historical weather data is available for dates one year prior
- Network connectivity is available for API requests
- Humidity value of 48% and visibility of 1.6km appear to be hardcoded placeholders

### Risks and Edge Cases
- Unknown to validate: Which external weather API provider is used
- Unknown to validate: How WeatherViewModel is implemented (not included in provided files)
- Unknown to validate: API authentication mechanism and credentials
- Unknown to validate: Error handling strategy for failed API requests
- Unknown to validate: Offline mode capabilities or data caching
- Unknown to validate: Rate limiting or quota restrictions on weather API
- Scope boundary: No multi-location support or location search; only current GPS location
- Scope boundary: No weather alerts, forecasts beyond comparison, or radar maps

## Phase 4: Final Plan
### Recommended Approach
- Implement the plan as a single coherent approach (no parallel competing implementations).
- Follow the ordered steps below; preserve interaction and visual behavior before introducing structural changes.

### Implementation Steps
1. Create WeatherModels.swift with WeatherData, WeeklyComparisonItem, and API response Codable structs
2. Implement LocationService.swift with CLLocationManager wrapper, authorization request, and coordinate publishing via Combine
3. Build WeatherAPIClient.swift with async methods for current and historical weather fetching (stub API endpoint during development)
4. Create WeatherViewModel.swift as ObservableObject with @Published properties, location subscription, API call orchestration, and temperature comparison logic
5. Build TemperatureView.swift component accepting title and temperature, rendering VStack with formatted text
6. Build WeatherInfoView.swift component accepting iconName, value, title, rendering VStack with SF Symbol and labels
7. Implement ContentView.swift with TabView containing Today and Weekly tabs, binding to WeatherViewModel state
8. Build Today tab with location header, two TemperatureView instances, WeatherInfoView row, and daily summary text with comparison phrase
9. Build Weekly tab with List iterating weeklyComparison array, rendering HStack rows with date and temperatures
10. Configure App.swift entry point with .accentColor(.black) and integrate ContentView with WeatherViewModel as @StateObject

### Testing
- On launch with location permission granted, app displays user's city name within 3 seconds
- Current temperature and last year temperature populate without error for valid coordinates
- Daily summary text correctly displays 'colder than', 'hotter than', or 'same as' based on temperature difference
- Weekly tab displays exactly 7 rows with dates formatted as 'EEEE, d MMMM' in descending order
- Tapping between Today and Weekly tabs transitions smoothly without data loss or refetch
- When location unavailable, app shows 'Locating...' and does not crash
- When API fails, app displays error state without breaking UI layout
- Temperature values round correctly and display in Celsius without decimal overflow
- Wind speed displays in km/h, humidity as percentage, visibility in km
- Historical weather date is exactly 365 days prior to current date for all fetches

### Rollout and Migration Notes
- No persistent database required; all weather data fetched on-demand from API
- Consider UserDefaults for caching last known location to reduce permission prompts
- Optional: cache last fetched weather data with timestamp for offline fallback display

## Implementation Prompt (LLM Ready)
```markdown
Implement pmarquees/todaylastyear using this plan.
Target agent: claude-code.

## Priority Order
1. Preserve original route/layout interaction model (do not replace floating menus with static sidebars unless source actually uses sidebar-first shell).
2. Preserve business behavior and data contracts with explicit validations.
3. Apply the specified design tokens and component recipes consistently.

## Objective
iOS SwiftUI weather comparison app that displays current weather alongside same-date historical data from one year ago, with GPS-based location detection and tab-based navigation between daily and weekly comparison views.

## Route Fidelity Requirements
- Today Tab: Vertical scroll view with white 0.2 opacity background. Top: location name, centered. Middle: two temperature cards side-by-side (current left, last year right), each with title, large temperature, and weather description. Below: WeatherInfoView row with wind/humidity/visibility icons. Bottom: daily summary text with temperature difference and comparison phrase. Components: NavigationStack, TabView, TemperatureView, WeatherInfoView. Logic: Fetch location on appear via CoreLocation | Pass coordinates to WeatherViewModel | Display 'Locating...' until location resolved | Show 'Loading...' in weather description until API returns | Calculate temp difference as current minus last year | Format comparison text: 'colder than' if current higher, 'hotter than' if lower, 'same as' if equal
- Weekly Comparison Tab: Vertical list with white 0.2 opacity background. Each row: date formatted as 'EEEE, d MMMM' left-aligned, current temperature center, last year temperature right, all horizontally arranged within rounded rectangle cards with padding. Components: TabView, List, HStack per row, Text for date/temps. Logic: Fetch 7 days of current and historical weather data | Display dates in descending order (most recent first) | Round temperatures to nearest integer | Use date as unique identifier for list items

## Non-negotiable Rules
- Always request location permission before attempting weather fetch; do not proceed without coordinates
- Historical weather date must be exactly 365 days prior to current date for accurate year-over-year comparison
- Temperature comparison logic: if currentTemp > lastYearTemp use 'colder than', if currentTemp < lastYearTemp use 'hotter than', if equal use 'same as'
- Round all displayed temperatures to nearest integer or one decimal place for readability
- Weekly comparison always shows last 7 days in descending chronological order
- Date formatting must use 'EEEE, d MMMM' pattern (e.g., 'Monday, 15 January')
- Display wind speed in km/h and temperature in Celsius without unit conversion
- TabView selection must toggle between 0 (Today) and 1 (Weekly) with no other indices
- Show placeholder text ('Locating...', 'Loading...') until async operations complete
- Background opacity must be white at 0.2 for consistent translucent effect

## Build Order
1. Create WeatherModels.swift with WeatherData, WeeklyComparisonItem, and API response Codable structs
2. Implement LocationService.swift with CLLocationManager wrapper, authorization request, and coordinate publishing via Combine
3. Build WeatherAPIClient.swift with async methods for current and historical weather fetching (stub API endpoint during development)
4. Create WeatherViewModel.swift as ObservableObject with @Published properties, location subscription, API call orchestration, and temperature comparison logic
5. Build TemperatureView.swift component accepting title and temperature, rendering VStack with formatted text
6. Build WeatherInfoView.swift component accepting iconName, value, title, rendering VStack with SF Symbol and labels
7. Implement ContentView.swift with TabView containing Today and Weekly tabs, binding to WeatherViewModel state
8. Build Today tab with location header, two TemperatureView instances, WeatherInfoView row, and daily summary text with comparison phrase
9. Build Weekly tab with List iterating weeklyComparison array, rendering HStack rows with date and temperatures
10. Configure App.swift entry point with .accentColor(.black) and integrate ContentView with WeatherViewModel as @StateObject

## Test Gates
- On launch with location permission granted, app displays user's city name within 3 seconds
- Current temperature and last year temperature populate without error for valid coordinates
- Daily summary text correctly displays 'colder than', 'hotter than', or 'same as' based on temperature difference
- Weekly tab displays exactly 7 rows with dates formatted as 'EEEE, d MMMM' in descending order
- Tapping between Today and Weekly tabs transitions smoothly without data loss or refetch
- When location unavailable, app shows 'Locating...' and does not crash
- When API fails, app displays error state without breaking UI layout
- Temperature values round correctly and display in Celsius without decimal overflow
- Wind speed displays in km/h, humidity as percentage, visibility in km
- Historical weather date is exactly 365 days prior to current date for all fetches
```