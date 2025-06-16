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
      defaultBillable: false,
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

      // Convert date strings back to Date objects with validation
      if (this.currentTask && this.currentTask.startTime) {
        const startTime = new Date(this.currentTask.startTime);
        if (isNaN(startTime.getTime())) {
          console.warn('Background: Invalid startTime for currentTask, resetting');
          this.currentTask = null;
        } else {
          this.currentTask.startTime = startTime;
          this.currentTask.duration = Number(this.currentTask.duration) || 0;
          console.log('Background: Restored current task:', this.currentTask);
        }
      }
      
      if (this.pausedTask && this.pausedTask.startTime) {
        const startTime = new Date(this.pausedTask.startTime);
        if (isNaN(startTime.getTime())) {
          console.warn('Background: Invalid startTime for pausedTask, resetting');
          this.pausedTask = null;
        } else {
          this.pausedTask.startTime = startTime;
          this.pausedTask.duration = Number(this.pausedTask.duration) || 0;
          console.log('Background: Restored paused task:', this.pausedTask);
        }
      }
      
      // Validate and convert task dates
      this.tasks = this.tasks.map(task => {
        const startTime = new Date(task.startTime);
        const endTime = task.endTime ? new Date(task.endTime) : null;
        
        // Skip tasks with invalid dates
        if (isNaN(startTime.getTime()) || (task.endTime && isNaN(endTime.getTime()))) {
          console.warn('Background: Skipping task with invalid dates:', task);
          return null;
        }
        
        return {
          ...task,
          startTime,
          endTime,
          duration: Number(task.duration) || 0
        };
      }).filter(task => task !== null); // Remove invalid tasks

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
      // Helper function to safely convert Date to ISO string
      const safeToISOString = (date) => {
        if (!date) return null;
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
          console.warn('Background: Invalid date encountered during save:', date);
          return new Date().toISOString(); // Fallback to current time
        }
        return dateObj.toISOString();
      };

      // Convert Date objects to ISO strings for storage with validation
      const dataToSave = {
        currentTask: this.currentTask ? {
          ...this.currentTask,
          startTime: safeToISOString(this.currentTask.startTime)
        } : null,
        pausedTask: this.pausedTask ? {
          ...this.pausedTask,
          startTime: safeToISOString(this.pausedTask.startTime)
        } : null,
        tasks: this.tasks.map(task => ({
          ...task,
          startTime: safeToISOString(task.startTime),
          endTime: safeToISOString(task.endTime)
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
      
      // Handle async operations properly
      const handleAsync = async () => {
        try {
          switch (message.action) {
            case 'getInitialState':
              return await this.handleGetInitialState();
              
            case 'startTask':
              return await this.handleStartTask(message.data);
              
            case 'pauseTask':
              return await this.handlePauseTask();
              
            case 'stopTask':
              return await this.handleStopTask();
              
            case 'resumeTask':
              return await this.handleResumeTask();
              
            case 'stopPausedTask':
              return await this.handleStopPausedTask();
              
            case 'updateTask':
              return await this.handleUpdateTask(message.data);
              
            case 'deleteTask':
              return await this.handleDeleteTask(message.data);
              
            case 'exportTasks':
              return await this.handleExportTasks();
              
            case 'updateSettings':
              return await this.handleUpdateSettings(message.data);
              
            case 'updateIcon':
              this.updateIcon(message.state);
              return { success: true };
              
            default:
              return { success: false, error: 'Unknown action' };
          }
        } catch (error) {
          console.error('Background: Error handling message:', error);
          return { success: false, error: error.message };
        }
      };

      // For async operations, handle them and send response
      if (['getInitialState', 'startTask', 'pauseTask', 'stopTask', 'resumeTask', 'stopPausedTask', 'updateTask', 'deleteTask', 'exportTasks', 'updateSettings'].includes(message.action)) {
        handleAsync().then(response => {
          console.log('Background: Sending response:', response);
          sendResponse(response);
        }).catch(error => {
          console.error('Background: Error in async handler:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // Keep message channel open for async response
      }
      
      // For sync operations
      if (message.action === 'updateIcon') {
        this.updateIcon(message.state);
        sendResponse({ success: true });
      }
    });
  }

  async handleGetInitialState() {
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
      return { success: true, data: state };
    } catch (error) {
      console.error('Background: Error getting initial state:', error);
      return { success: false, error: error.message };
    }
  }

  async handleStartTask(taskData) {
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
      
      return { success: true, data: this.currentTask };
    } catch (error) {
      console.error('Background: Error starting task:', error);
      return { success: false, error: error.message };
    }
  }

  async handlePauseTask() {
    try {
      if (!this.currentTask) {
        return { success: false, error: 'No active task to pause' };
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
      
      return { success: true, data: this.pausedTask };
    } catch (error) {
      console.error('Background: Error pausing task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleStopTask() {
    try {
      if (!this.currentTask) {
        return { success: false, error: 'No active task to stop' };
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
      
      return { success: true, data: completedTask };
    } catch (error) {
      console.error('Background: Error stopping task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleResumeTask() {
    try {
      if (!this.pausedTask) {
        return { success: false, error: 'No paused task to resume' };
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
      
      return { success: true, data: this.currentTask };
    } catch (error) {
      console.error('Background: Error resuming task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleStopPausedTask() {
    try {
      if (!this.pausedTask) {
        return { success: false, error: 'No paused task to stop' };
      }
      
      this.pausedTask.endTime = new Date();
      this.tasks.unshift(this.pausedTask);
      const completedTask = this.pausedTask;
      this.pausedTask = null;
      
      await this.saveData();
      this.updateIcon('idle');
      this.notifyPopupStateChange();
      
      return { success: true, data: completedTask };
    } catch (error) {
      console.error('Background: Error stopping paused task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleUpdateTask(data) {
    try {
      const { task, taskType } = data;
      
      if (taskType === 'current' && this.currentTask && this.currentTask.id === task.id) {
        // Update current task (but preserve timing for active tasks)
        this.currentTask = {
          ...this.currentTask,
          title: task.title,
          customer: task.customer,
          project: task.project,
          billable: task.billable
          // Don't update startTime or duration for active tasks
        };
        
      } else if (taskType === 'paused' && this.pausedTask && this.pausedTask.id === task.id) {
        // Update paused task
        this.pausedTask = {
          ...task,
          startTime: new Date(task.startTime),
          endTime: task.endTime ? new Date(task.endTime) : null
        };
        
      } else if (taskType === 'completed') {
        // Update completed task
        const taskIndex = this.tasks.findIndex(t => t.id === task.id);
        if (taskIndex !== -1) {
          this.tasks[taskIndex] = {
            ...task,
            startTime: new Date(task.startTime),
            endTime: task.endTime ? new Date(task.endTime) : null
          };
        }
      }
      
      await this.saveData();
      this.notifyPopupStateChange();
      
      return { success: true };
    } catch (error) {
      console.error('Background: Error updating task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleDeleteTask(data) {
    try {
      const { taskId, taskType } = data;
      
      if (taskType === 'current' && this.currentTask && this.currentTask.id === taskId) {
        this.currentTask = null;
        this.updateIcon('idle');
        
      } else if (taskType === 'paused' && this.pausedTask && this.pausedTask.id === taskId) {
        this.pausedTask = null;
        this.updateIcon('idle');
        
      } else if (taskType === 'completed') {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
      }
      
      await this.saveData();
      this.notifyPopupStateChange();
      
      return { success: true };
    } catch (error) {
      console.error('Background: Error deleting task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleExportTasks() {
    try {
      if (this.tasks.length === 0) {
        return { success: false, error: 'No tasks to export' };
      }

      const csvContent = this.generateCSV(this.tasks);
      return { success: true, data: csvContent };
    } catch (error) {
      console.error('Background: Error exporting tasks:', error);
      return { success: false, error: error.message };
    }
  }

  async handleUpdateSettings(settingsData) {
    try {
      this.customers = settingsData.customers || this.customers;
      this.projects = settingsData.projects || this.projects;
      this.settings = { ...this.settings, ...settingsData.settings };
      
      await this.saveData();
      this.notifyPopupStateChange();
      
      return { success: true };
    } catch (error) {
      console.error('Background: Error updating settings:', error);
      return { success: false, error: error.message };
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
    if (this.currentTask && this.currentTask.startTime) {
      const currentTime = Date.now();
      const startTime = this.currentTask.startTime.getTime();
      
      // Validate that we have a valid start time
      if (isNaN(startTime)) {
        console.warn('Background: Invalid start time for current task');
        return;
      }
      
      const sessionDuration = currentTime - startTime;
      const totalDuration = this.currentTask.duration + sessionDuration;
      
      chrome.runtime.sendMessage({
        action: 'timerUpdate',
        data: {
          totalDuration,
          formattedTime: this.formatDuration(totalDuration),
          sessionDuration,
          startTime: this.currentTask.startTime
        }
      }).catch(() => {
        // Popup is closed, ignore error
      });
    }
  }

  generateCSV(tasks) {
    const headers = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)'];
    const rows = tasks.map(task => {
      // Ensure we have valid dates for CSV export
      const startTime = task.startTime instanceof Date ? task.startTime : new Date(task.startTime);
      const endTime = task.endTime ? (task.endTime instanceof Date ? task.endTime : new Date(task.endTime)) : null;
      
      return [
        `"${task.title.replace(/"/g, '""')}"`,
        `"${task.customer}"`,
        `"${task.project}"`,
        task.billable ? 'Y' : 'N',
        isNaN(startTime.getTime()) ? '' : startTime.toISOString(),
        endTime && !isNaN(endTime.getTime()) ? endTime.toISOString() : '',
        Math.floor((Number(task.duration) || 0) / 1000)
      ];
    });
    
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