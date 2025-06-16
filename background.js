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
    const iconPaths = {
      idle: {
        '16': 'icons/icon-16-gray.png',
        '32': 'icons/icon-32-gray.png',
        '48': 'icons/icon-48-gray.png',
        '128': 'icons/icon-128-gray.png'
      },
      active: {
        '16': 'icons/icon-16-green.png',
        '32': 'icons/icon-32-green.png',
        '48': 'icons/icon-48-green.png',
        '128': 'icons/icon-128-green.png'
      },
      paused: {
        '16': 'icons/icon-16-orange.png',
        '32': 'icons/icon-32-orange.png',
        '48': 'icons/icon-48-orange.png',
        '128': 'icons/icon-128-orange.png'
      }
    };

    // For now, we'll use basic icons - in production you'd have different colored versions
    chrome.action.setIcon({
      path: iconPaths.idle // We'll create proper colored icons later
    });

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