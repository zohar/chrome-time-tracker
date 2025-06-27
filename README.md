# Open Time Tracker - Chrome Extension

A professional time tracking Chrome extension with task management, reporting, and webhook integration.


## Features

### Core Functionality
- **Task Management**: Start, stop, pause, and resume tasks with detailed tracking
- **Task Properties**: Title, customer, project, billable status, and precise timestamps
- **Time Summaries**: Daily, weekly, and monthly totals with billable time breakdown
- **Quick Actions**: Keyboard-friendly interface with shortcuts

### Data Management
- **Local Storage**: All data stored locally using Chrome storage APIs
- **CSV Export**: Export tasks with preset date ranges or custom selections
- **Data Import**: Import existing time logs from CSV files
- **Backup & Restore**: Complete data export and import functionality

### Customization
- **Customer/Project Management**: Configurable lists in settings
- **Default Settings**: Set default customer and project for new tasks
- **Webhook Integration**: Optional sync with external services

### User Experience
- **Compact Design**: Popup under 400px width, optimized for quick access
- **Visual Feedback**: Extension icon changes color based on tracking status
- **Responsive Design**: Works seamlessly across different screen sizes
- **Keyboard Shortcuts**: Fast interactions with Ctrl+J (pause/resume) and Ctrl+K (stop)

## Installation

### For Development & Testing
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the extension directory
4. The Open Time Tracker icon will appear in your extension toolbar

### For Distribution (Chrome Web Store Ready)
1. Run `npm run build:extension` to create a clean package
2. The `extension-build/` folder contains only the necessary files (322KB)
3. Zip the `extension-build/` folder for Chrome Web Store submission

**Note**: The development directory is ~139MB due to `node_modules`, but the packaged extension is only 322KB when built properly.

## Usage

### Starting a Task
1. Click the extension icon to open the popup
2. Enter a task title
3. Select customer and project (optional)
4. Toggle billable status with the $ icon
5. Click "Start Task"

### Managing Tasks
- **Pause**: Click the pause button to temporarily stop tracking
- **Resume**: Click resume to continue a paused task (creates new task entry)
- **Stop**: Click stop to complete and save the task
- **Edit**: Click on any task in the recent list to edit details

### Keyboard Shortcuts
- `Ctrl+J` (or `Cmd+J` on Mac): Pause/Resume current task
- `Ctrl+K` (or `Cmd+K` on Mac): Stop current task
- `Ctrl+Enter`: Start new task (when form is filled)

### Settings
Access settings by clicking the gear icon in the popup header:
- Configure customer and project lists
- Set default customer and project
- Enable webhook integration
- Manage data import/export

### CSV Export
Export your time logs with these presets:
- This Week
- Previous Week  
- This Month
- Previous Month
- Custom Date Range

CSV format includes: Task Title, Customer, Project, Billable (Y/N), Start Time, End Time, Duration (seconds)

### Webhook Integration
Configure webhooks in settings to automatically sync completed tasks with external services. The extension will POST task data in JSON format to your specified endpoint.

## Data Structure

Tasks are stored with the following properties:
```json
{
  "id": 1640995200000,
  "title": "Task description",
  "customer": "Client Name",
  "project": "Project Name", 
  "billable": true,
  "startTime": "2023-01-01T10:00:00.000Z",
  "endTime": "2023-01-01T11:30:00.000Z",
  "duration": 5400000
}
```

## Extension States

The extension icon provides visual feedback:
- **Gray**: Idle (no active task)
- **Green with dot**: Active task running
- **Orange with pause**: Task paused

## Security & Privacy

- All data is stored locally in your browser
- No external accounts or authentication required
- Webhook integration is optional and configurable
- Data never leaves your device unless you explicitly export or enable webhooks

## Development

This extension is built with:
- Manifest V3
- Vanilla JavaScript
- Chrome Extension APIs
- Local storage for data persistence

### Build Process

The project includes development dependencies (React, Vite, TypeScript, ESLint) for potential future enhancements, but the core extension uses vanilla JavaScript.

**Development Commands:**
```bash
npm install          # Install development dependencies
npm run lint         # Run ESLint checks
npm run build:extension  # Create distribution package
```

**Package Size Optimization:**
- **Development Directory**: ~139MB (includes node_modules, config files)
- **Production Package**: 322KB (essential files only)
- **Files Included in Package**: manifest.json, background.js, popup files, options files, icons
- **Files Excluded**: node_modules, src/, dist/, config files, documentation

**Extension Package Contents:**
```
extension-build/
├── manifest.json
├── background.js
├── popup.html, popup.js, popup.css
├── options.html, options.js, options.css
└── icons/
    ├── icon-16.png, icon-32.png, icon-48.png, icon-128.png
    ├── logo.png
    ├── help.svg
    └── play.svg
```

## Support

For issues or feature requests, please check the extension's options page for troubleshooting and data management tools.
