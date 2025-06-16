// Background script for Time Tracker Pro
class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateIcon') {
        this.updateIcon(message.state);
      }
    });

    // Set initial icon state
    this.updateIcon('idle');
  }

  updateIcon(state) {
    // Update badge text to show state
    const badgeText = {
      idle: '',
      active: '●',
      paused: '⏸'
    };

    const badgeColor = {
      idle: [128, 128, 128, 255],
      active: [34, 197, 94, 255],
      paused: [245, 158, 11, 255]
    };

    chrome.action.setBadgeText({ text: badgeText[state] });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor[state] });
  }
}

// Initialize background service
new BackgroundService();