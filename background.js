// Background script for Time Tracker Pro - State Management
class BackgroundService {
  constructor() {
    this.currentTask = null;
    this.pausedTask = null;
    this.tasks = [];
    this.customers = ['Default Client'];
    this.projects = ['General'];
    this.settings = {
      defaultCustomer: '',
      defaultProject: '',
      webhookUrl: '',
      webhookEnabled: false
    };
    this.timerInterval = null;
    
    this.init();
  }

  async init() {
    console.log('Background service initializing...');
    await this.loadData();
    this.setupMessageListener();
    this.startTimer();
    this.updateIcon('idle');
    console.log('Background service initialized');
  }

  async loadData() {
    try {
      const data = await chrome.storage.local.get([
        'currentTask',
        'pausedTask', 
        'tasks',
        'customers',
        'projects',
        'settings'
      ]);
      
      console.log('Background: Loading data from storage:', data);
      
      this.currentTask = data.currentTask || null;
      this.pausedTask = data.pausedTask || null;
      this.tasks = data.tasks || [];
      this.customers = data.customers || ['Default Client'];
      this.projects = data.projects || ['General'];
      this.settings = { ...this.settings, ...data.settings };

      // Convert date strings back to Date objects
      if (this.currentTask && this.currentTask.startTime) {
        this.currentTask.startTime = new Date(this.currentTask.startTime);
        this.currentTask.duration = Number(this.currentTask.duration) || 0;
        console.log('Background: Restored current task:', this.currentTask);
      }
      
      if (this.pausedTask && this.pausedTask.startTime) {
        this.pausedTask.startTime = new Date(this.pausedTask.startTime);
        this.pausedTask.duration = Number(this.pausedTask.duration) || 0;
        console.log('Background: Restored paused task:', this.pausedTask);
      }
      
      this.tasks = this.tasks.map(task => ({
        ...task,
        startTime: new Date(task.startTime),
        endTime: task.endTime ? new Date(task.endTime) : null,
        duration: Number(task.duration) || 0
      }));

      // Set appropriate icon state
      if (this.currentTask) {
        this.updateIcon('active');
      } else if (this.pausedTask) {
        this.updateIcon('paused');
      } else {
        this.updateIcon('idle');
      }
      
    } catch (error) {
      console.error('Background: Error loading data:', error);
    }
  }

  async saveData() {
    try {
      // Convert Date objects to ISO strings for storage
      const dataToSave = {
        currentTask: this.currentTask ? {
          ...this.currentTask,
          startTime: this.currentTask.startTime.toISOString()
        } : null,
        pausedTask: this.pausedTask ? {
          ...this.pausedTask,
          startTime: this.pausedTask.startTime.toISOString()
        } : null,
        tasks: this.tasks.map(task => ({
          ...task,
          startTime: task.startTime.toISOString(),
          endTime: task.endTime ? task.endTime.toISOString() : null
        })),
        customers: this.customers,
        projects: this.projects,
        settings: this.settings
      };
      
      await chrome.storage.local.set(dataToSave);
      console.log('Background: Data saved successfully');
    } catch (error) {
      console.error('Background: Error saving data:', error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Background: Received message:', message);
      
      switch (message.action) {
        case 'getInitialState':
          this.handleGetInitialState(sendResponse);
          return true; // Keep message channel open for async response
          
        case 'startTask':
          this.handleStartTask(message.data, sendResponse);
          return true;
          
        case 'pauseTask':
          this.handlePauseTask(sendResponse);
          return true;
          
        case 'stopTask':
          this.handleStopTask(sendResponse);
          return true;
          
        case 'resumeTask':
          this.handleResumeTask(sendResponse);
          return true;
          
        case 'stopPausedTask':
          this.handleStopPausedTask(sendResponse);
          return true;
          
        case 'exportTasks':
          this.handleExportTasks(sendResponse);
          return true;
          
        case 'updateIcon':
          this.updateIcon(message.state);
          break;
          
        case 'updateSettings':
          this.handleUpdateSettings(message.data, sendResponse);
          return true;
      }
    });
  }

  async handleGetInitialState(sendResponse) {
    try {
      const state = {
        currentTask: this.currentTask,
        pausedTask: this.pausedTask,
        tasks: this.tasks,
        customers: this.customers,
        projects: this.projects,
        settings: this.settings
      };
      
      console.log('Background: Sending initial state:', state);
      sendResponse({ success: true, data: state });
    } catch (error) {
      console.error('Background: Error getting initial state:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleStartTask(taskData, sendResponse) {
    try {
      this.currentTask = {
        id: Date.now(),
        title: taskData.title,
        customer: taskData.customer,
        project: taskData.project,
        billable: taskData.billable,
        startTime: new Date(),
        duration: 0
      };
      
      console.log('Background: Started task:', this.currentTask);
      
      await this.saveData();
      this.updateIcon('active');
      this.notifyPopupStateChange();
      
      sendResponse({ success: true, data: this.currentTask });
    } catch (error) {
      console.error('Background: Error starting task:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handlePauseTask(sendResponse) {
    try {
      if (!this.currentTask) {
        sendResponse({ success: false, error: 'No active task to pause' });
        return;
      }
      
      const currentTime = Date.now();
      const sessionDuration = currentTime - this.currentTask.startTime.getTime();
      this.currentTask.duration += sessionDuration;
      
      this.pausedTask = { ...this.currentTask };
      this.currentTask = null;
      
      console.log('Background: Paused task:', this.pausedTask);
      
      await this.saveData();
      this.updateIcon('paused');
      this.notifyPopupStateChange();
      
      sendResponse({ success: true, data: this.pausedTask });
    } catch (error) {
      console.error('Background: Error pausing task:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleStopTask(sendResponse) {
    try {
      if (!this.currentTask) {
        sendResponse({ success: false, error: 'No active task to stop' });
        return;
      }
      
      const currentTime = Date.now();
      const sessionDuration = currentTime - this.currentTask.startTime.getTime();
      this.currentTask.duration += sessionDuration;
      this.currentTask.endTime = new Date();
      
      console.log('Background: Stopped task:', this.currentTask);
      
      this.tasks.unshift(this.currentTask);
      const completedTask = this.currentTask;
      this.currentTask = null;
      
      await this.saveData();
      this.updateIcon('idle');
      this.notifyPopupStateChange();
      
      // Send webhook if enabled
      if (this.settings.webhookEnabled && this.settings.webhookUrl) {
        this.sendWebhook(completedTask);
      }
      
      sendResponse({ success: true, data: completedTask });
    } catch (error) {
      console.error('Background: Error stopping task:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleResumeTask(sendResponse) {
    try {
      if (!this.pausedTask) {
        sendResponse({ success: false, error: 'No paused task to resume' });
        return;
      }
      
      this.currentTask = {
        ...this.pausedTask,
        id: Date.now(),
        startTime: new Date()
        // Keep existing duration from paused task
      };
      
      this.pausedTask = null;
      
      console.log('Background: Resumed task:', this.currentTask);
      
      await this.saveData();
      this.updateIcon('active');
      this.notifyPopupStateChange();
      
      sendResponse({ success: true, data: this.currentTask });
    } catch (error) {
      console.error('Background: Error resuming task:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleStopPausedTask(sendResponse) {
    try {
      if (!this.pausedTask) {
        sendResponse({ success: false, error: 'No paused task to stop' });
        return;
      }
      
      this.pausedTask.endTime = new Date();
      this.tasks.unshift(this.pausedTask);
      const completedTask = this.pausedTask;
      this.pausedTask = null;
      
      await this.saveData();
      this.updateIcon('idle');
      this.notifyPopupStateChange();
      
      sendResponse({ success: true, data: completedTask });
    } catch (error) {
      console.error('Background: Error stopping paused task:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleExportTasks(sendResponse) {
    try {
      if (this.tasks.length === 0) {
        sendResponse({ success: false, error: 'No tasks to export' });
        return;
      }

      const csvContent = this.generateCSV(this.tasks);
      sendResponse({ success: true, data: csvContent });
    } catch (error) {
      console.error('Background: Error exporting tasks:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleUpdateSettings(settingsData, sendResponse) {
    try {
      this.customers = settingsData.customers || this.customers;
      this.projects = settingsData.projects || this.projects;
      this.settings = { ...this.settings, ...settingsData.settings };
      
      await this.saveData();
      this.notifyPopupStateChange();
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Background: Error updating settings:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  startTimer() {
    // Clear any existing timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    console.log('Background: Starting timer...');
    this.timerInterval = setInterval(() => {
      if (this.currentTask) {
        // Periodically save current task state to prevent data loss
        this.saveData();
        
        // Notify popup if it's open
        this.notifyPopupTimerUpdate();
      }
    }, 1000);
  }

  notifyPopupStateChange() {
    // Try to send message to popup (will fail silently if popup is closed)
    chrome.runtime.sendMessage({
      action: 'stateChanged',
      data: {
        currentTask: this.currentTask,
        pausedTask: this.pausedTask,
        tasks: this.tasks,
        customers: this.customers,
        projects: this.projects,
        settings: this.settings
      }
    }).catch(() => {
      // Popup is closed, ignore error
    });
  }

  notifyPopupTimerUpdate() {
    if (this.currentTask) {
      const currentTime = Date.now();
      const sessionDuration = currentTime - this.currentTask.startTime.getTime();
      const totalDuration = this.currentTask.duration + sessionDuration;
      
      chrome.runtime.sendMessage({
        action: 'timerUpdate',
        data: {
          totalDuration,
          formattedTime: this.formatDuration(totalDuration)
        }
      }).catch(() => {
        // Popup is closed, ignore error
      });
    }
  }

  generateCSV(tasks) {
    const headers = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)'];
    const rows = tasks.map(task => [
      `"${task.title.replace(/"/g, '""')}"`,
      `"${task.customer}"`,
      `"${task.project}"`,
      task.billable ? 'Y' : 'N',
      task.startTime.toISOString(),
      task.endTime ? task.endTime.toISOString() : '',
      Math.floor((Number(task.duration) || 0) / 1000)
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  formatDuration(ms) {
    if (!ms || isNaN(ms) || ms < 0) {
      return '00:00:00';
    }
    
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  updateIcon(state) {
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

  async sendWebhook(task) {
    try {
      await fetch(this.settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: task.id,
          title: task.title,
          customer: task.customer,
          project: task.project,
          billable: task.billable,
          startTime: task.startTime,
          endTime: task.endTime,
          duration: task.duration
        })
      });
      console.log('Background: Webhook sent successfully');
    } catch (error) {
      console.error('Background: Webhook failed:', error);
    }
  }

  // Helper methods for date calculations
  getTasksForPeriod(period, date) {
    switch (period) {
      case 'today':
        return this.tasks.filter(task => this.isToday(task.startTime));
      case 'week':
        return this.tasks.filter(task => this.isThisWeek(task.startTime, date));
      case 'month':
        return this.tasks.filter(task => this.isThisMonth(task.startTime, date));
      default:
        return [];
    }
  }

  isToday(date) {
    const today = new Date();
    const taskDate = new Date(date);
    return taskDate.toDateString() === today.toDateString();
  }

  isThisWeek(date, referenceDate) {
    const taskDate = new Date(date);
    const startOfWeek = new Date(referenceDate);
    startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return taskDate >= startOfWeek && taskDate <= endOfWeek;
  }

  isThisMonth(date, referenceDate) {
    const taskDate = new Date(date);
    return taskDate.getMonth() === referenceDate.getMonth() && 
           taskDate.getFullYear() === referenceDate.getFullYear();
  }
}

// Initialize background service
new BackgroundService();