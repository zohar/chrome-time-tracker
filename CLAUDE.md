# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Time Tracker is a Chrome extension (Manifest V3) for professional time tracking with task management, CSV export/import, and webhook integration. The extension uses vanilla JavaScript with Chrome extension APIs and local storage for persistence.

## Development Commands

```bash
# Linting
npm run lint

# Development build (for React components in src/ - currently unused)
npm run dev
npm run build

# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select the project directory
```

## Architecture

### Core Components

**Background Service Worker** (`background.js`)
- `BackgroundService` class manages all persistent state and business logic
- Handles task timing, data persistence, webhook integration, and icon updates
- Communicates with popup/options via Chrome runtime messaging API
- Implements retry logic and service worker wake-up mechanisms for Manifest V3 reliability

**Popup Interface** (`popup.js`, `popup.html`, `popup.css`)
- `TimeTracker` class manages the main UI for starting/stopping tasks
- Features task list with pagination (10 items), date grouping, and daily totals
- Handles service worker communication failures with automatic retry and wake-up
- Task editing via modal, keyboard shortcuts (Ctrl+J pause/resume, Ctrl+K stop)

**Options/Settings Page** (`options.js`, `options.html`, `options.css`)
- `SettingsManager` class for configuration, data import/export, and CSV handling
- CSV import supports both new and existing data (creates duplicates - no deduplication)
- Export presets: This Week, Previous Week, This Month, Previous Month, Custom Range

### Data Architecture

**Storage Pattern**: Chrome `storage.local` API with three main data structures:
- `tasks[]`: Array of task objects with ID, title, customer, project, times, duration
- `customers[]`/`projects[]`: String arrays for dropdown options
- `settings{}`: User preferences and webhook configuration

**Task States**: 
- Active task: `currentTask` with running timer
- Paused task: `pausedTask` with accumulated duration
- Completed tasks: Stored in `tasks[]` array

**ID Generation**: 
- New tasks: `Date.now()` (integer timestamps)
- Imported tasks: `Date.now() + Math.random() * 1000 + i` (float with decimals)
- Use `parseFloat()` not `parseInt()` when parsing task IDs to handle both formats

### Communication Pattern

Popup ↔ Background messaging uses action-based system:
- `getInitialState`, `startTask`, `pauseTask`, `stopTask`, `resumeTask`
- `updateTask`, `deleteTask`, `exportTasks`, `updateSettings`
- All async operations return `{success: boolean, data?: any, error?: string}`

### UI Features

**Task List Display**:
- Sorted by most recent first (startTime/endTime descending)
- Grouped by date with smart headers ("Today", "Yesterday", formatted dates)
- Shows daily totals including live current task time
- Pagination loads 10 more tasks per click
- Click task info to edit, click delete button to remove

**Extension Icon States**:
- Gray: Idle
- Green with dot: Active task running  
- Orange with pause: Task paused

### Important Implementation Details

**Service Worker Reliability**: Manifest V3 service workers can be terminated. The popup implements:
- Automatic wake-up attempts on connection failures
- Retry logic with exponential backoff
- `ping`/`pong` mechanism to check service worker status

**CSV Import Behavior**: Re-importing the same CSV creates complete duplicates - no deduplication logic exists.

**Time Handling**: All durations stored in milliseconds. Current task time includes both stored duration plus live session time.

**Data Migration**: When editing tasks, new customers/projects are automatically added to global lists and saved to settings.

## Future Features

### Daily Auto-Export CSV Feature

**Overview**: Implement automatic daily CSV export functionality using Chrome's alarms API to save time tracking data on a daily basis.

**Implementation Plan**:

1. **Add Auto-Export Settings**
   - Add new settings to control auto-export feature:
     - `autoExportEnabled: boolean` (default: false)
     - `autoExportTime: string` (default: "18:00" - 6 PM)
     - `autoExportPath: string` (default: "time-tracker-exports/")
   - Update options page UI to configure these settings
   - Add toggle, time picker, and folder name input

2. **Background Service Worker Enhancements**
   - Set up Chrome alarm when auto-export is enabled
   - Create `setupDailyExportAlarm()` method to schedule recurring daily export
   - Add alarm listener to handle the daily export trigger
   - Implement `handleDailyAutoExport()` method that:
     - Gets previous day's tasks (00:00 to 23:59:59)
     - Generates CSV using existing `generateCSV()` method
     - Triggers download with date-stamped filename

3. **Download Implementation**
   - Use Chrome's downloads API to save files automatically
   - Filename format: `time-tracker-YYYY-MM-DD.csv`
   - Allow user to configure export folder in Downloads
   - Add error handling and logging for failed exports

4. **Settings Management**
   - Update settings save/load to include new auto-export preferences
   - Add validation for time format and folder names
   - Persist alarm state across service worker restarts

5. **User Interface Updates**
   - Add auto-export section to options page
   - Include status indicator showing when next export is scheduled
   - Add manual "Export Yesterday" button for testing
   - Show last export date/time in settings

**Technical Details**:
- **Chrome APIs Used**: `chrome.alarms`, `chrome.downloads`, `chrome.storage.local`
- **Date Filtering**: Filter tasks by previous day's date range with timezone considerations
- **Error Handling**: Graceful handling of download failures, retry mechanism, user notifications
- **Permissions**: Extension already has required `alarms` permission in manifest.json