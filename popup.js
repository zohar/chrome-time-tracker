class TimeTracker {
  constructor() {
    // UI-only state - no persistent data stored here
    this.currentPeriod = 'today';
    this.state = {
      currentTask: null,
      pausedTask: null,
      tasks: [],
      customers: ['Default Client'],
      projects: ['General'],
      settings: {
        defaultCustomer: '',
        defaultProject: '',
        webhookUrl: '',
        webhookEnabled: false
      }
    };
    
    console.log('TimeTracker popup constructor called');
    this.init();
  }

  async init() {
    try {
      console.log('Initializing TimeTracker popup...');
      await this.loadInitialState();
      this.setupEventListeners();
      this.setupMessageListener();
      this.updateUI();
      console.log('TimeTracker popup initialized successfully');
    } catch (error) {
      console.error('Error initializing TimeTracker popup:', error);
    }
  }

  async loadInitialState() {
    try {
      console.log('Popup: Requesting initial state from background...');
      
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getInitialState' }, resolve);
      });
      
      if (response && response.success) {
        this.state = response.data;
        console.log('Popup: Received initial state:', this.state);
      } else {
        console.error('Popup: Failed to get initial state:', response);
      }
    } catch (error) {
      console.error('Popup: Error loading initial state:', error);
    }
  }

  setupMessageListener() {
    // Listen for state updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Popup: Received message:', message);
      
      switch (message.action) {
        case 'stateChanged':
          this.state = message.data;
          this.updateUI();
          break;
          
        case 'timerUpdate':
          this.updateCurrentTaskTimer(message.data.totalDuration, message.data.formattedTime);
          this.updateSummary();
          break;
      }
    });
  }

  setupEventListeners() {
    try {
      console.log('Setting up event listeners...');
      
      // Task controls
      const startBtn = document.getElementById('startBtn');
      const pauseBtn = document.getElementById('pauseBtn');
      const stopBtn = document.getElementById('stopBtn');
      const resumeBtn = document.getElementById('resumeBtn');
      const stopPausedBtn = document.getElementById('stopPausedBtn');
      
      if (startBtn) startBtn.addEventListener('click', () => this.startTask());
      if (pauseBtn) pauseBtn.addEventListener('click', () => this.pauseTask());
      if (stopBtn) stopBtn.addEventListener('click', () => this.stopTask());
      if (resumeBtn) resumeBtn.addEventListener('click', () => this.resumeTask());
      if (stopPausedBtn) stopPausedBtn.addEventListener('click', () => this.stopPausedTask());
      
      // Form inputs
      const taskTitle = document.getElementById('taskTitle');
      const billableToggle = document.getElementById('billableToggle');
      
      if (taskTitle) taskTitle.addEventListener('input', () => this.validateForm());
      if (billableToggle) billableToggle.addEventListener('click', () => this.toggleBillable());
      
      // Settings
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) settingsBtn.addEventListener('click', () => this.openSettings());
      
      // Summary tabs
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => this.switchPeriod(e.target.dataset.period));
      });
      
      // Export
      const exportBtn = document.getElementById('exportBtn');
      if (exportBtn) exportBtn.addEventListener('click', () => this.exportTasks());
      
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => this.handleKeyboard(e));
      
      console.log('Event listeners set up successfully');
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }

  validateForm() {
    try {
      const titleInput = document.getElementById('taskTitle');
      const startBtn = document.getElementById('startBtn');
      
      if (titleInput && startBtn) {
        const title = titleInput.value.trim();
        startBtn.disabled = !title;
      }
    } catch (error) {
      console.error('Error validating form:', error);
    }
  }

  toggleBillable() {
    try {
      const toggle = document.getElementById('billableToggle');
      if (toggle) {
        toggle.classList.toggle('active');
      }
    } catch (error) {
      console.error('Error toggling billable:', error);
    }
  }

  async startTask() {
    try {
      const titleInput = document.getElementById('taskTitle');
      const customerSelect = document.getElementById('customerSelect');
      const projectSelect = document.getElementById('projectSelect');
      const billableToggle = document.getElementById('billableToggle');
      
      if (!titleInput) return;
      
      const title = titleInput.value.trim();
      const customer = customerSelect ? customerSelect.value || this.state.customers[0] : this.state.customers[0];
      const project = projectSelect ? projectSelect.value || this.state.projects[0] : this.state.projects[0];
      const billable = billableToggle ? billableToggle.classList.contains('active') : false;
      
      if (!title) return;
      
      console.log('Popup: Starting task with data:', { title, customer, project, billable });
      
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'startTask',
          data: { title, customer, project, billable }
        }, resolve);
      });
      
      if (response && response.success) {
        console.log('Popup: Task started successfully');
        
        // Clear form
        titleInput.value = '';
        if (billableToggle) billableToggle.classList.remove('active');
        this.validateForm();
      } else {
        console.error('Popup: Failed to start task:', response);
      }
    } catch (error) {
      console.error('Error starting task:', error);
    }
  }

  async pauseTask() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'pauseTask' }, resolve);
      });
      
      if (response && response.success) {
        console.log('Popup: Task paused successfully');
      } else {
        console.error('Popup: Failed to pause task:', response);
      }
    } catch (error) {
      console.error('Error pausing task:', error);
    }
  }

  async stopTask() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'stopTask' }, resolve);
      });
      
      if (response && response.success) {
        console.log('Popup: Task stopped successfully');
      } else {
        console.error('Popup: Failed to stop task:', response);
      }
    } catch (error) {
      console.error('Error stopping task:', error);
    }
  }

  async resumeTask() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'resumeTask' }, resolve);
      });
      
      if (response && response.success) {
        console.log('Popup: Task resumed successfully');
      } else {
        console.error('Popup: Failed to resume task:', response);
      }
    } catch (error) {
      console.error('Error resuming task:', error);
    }
  }

  async stopPausedTask() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'stopPausedTask' }, resolve);
      });
      
      if (response && response.success) {
        console.log('Popup: Paused task stopped successfully');
      } else {
        console.error('Popup: Failed to stop paused task:', response);
      }
    } catch (error) {
      console.error('Error stopping paused task:', error);
    }
  }

  updateUI() {
    try {
      console.log('Updating UI...');
      this.updateTaskStates();
      this.updateCustomerProjectDropdowns();
      this.updateSummary();
      this.updateTaskList();
      console.log('UI updated successfully');
    } catch (error) {
      console.error('Error updating UI:', error);
    }
  }

  updateTaskStates() {
    try {
      const currentTaskEl = document.getElementById('currentTask');
      const pausedTaskEl = document.getElementById('pausedTask');
      const startTaskEl = document.getElementById('startTask');
      
      console.log('Updating task states:', {
        hasCurrentTask: !!this.state.currentTask,
        hasPausedTask: !!this.state.pausedTask
      });
      
      if (this.state.currentTask) {
        if (currentTaskEl) currentTaskEl.style.display = 'block';
        if (pausedTaskEl) pausedTaskEl.style.display = 'none';
        if (startTaskEl) startTaskEl.style.display = 'none';
        
        const titleEl = document.getElementById('currentTaskTitle');
        const customerEl = document.getElementById('currentTaskCustomer');
        const projectEl = document.getElementById('currentTaskProject');
        const billableEl = document.getElementById('currentTaskBillable');
        
        if (titleEl) titleEl.textContent = this.state.currentTask.title;
        if (customerEl) customerEl.textContent = this.state.currentTask.customer;
        if (projectEl) projectEl.textContent = this.state.currentTask.project;
        if (billableEl) billableEl.style.display = this.state.currentTask.billable ? 'inline-flex' : 'none';
        
        // Update timer immediately
        this.updateCurrentTaskTimerFromState();
        
      } else if (this.state.pausedTask) {
        if (currentTaskEl) currentTaskEl.style.display = 'none';
        if (pausedTaskEl) pausedTaskEl.style.display = 'block';
        if (startTaskEl) startTaskEl.style.display = 'none';
        
        const titleEl = document.getElementById('pausedTaskTitle');
        const customerEl = document.getElementById('pausedTaskCustomer');
        const projectEl = document.getElementById('pausedTaskProject');
        const billableEl = document.getElementById('pausedTaskBillable');
        const timerEl = document.getElementById('pausedTaskTimer');
        
        if (titleEl) titleEl.textContent = this.state.pausedTask.title;
        if (customerEl) customerEl.textContent = this.state.pausedTask.customer;
        if (projectEl) projectEl.textContent = this.state.pausedTask.project;
        if (billableEl) billableEl.style.display = this.state.pausedTask.billable ? 'inline-flex' : 'none';
        if (timerEl) timerEl.textContent = this.formatDuration(this.state.pausedTask.duration);
        
      } else {
        if (currentTaskEl) currentTaskEl.style.display = 'none';
        if (pausedTaskEl) pausedTaskEl.style.display = 'none';
        if (startTaskEl) startTaskEl.style.display = 'block';
      }
    } catch (error) {
      console.error('Error updating task states:', error);
    }
  }

  updateCurrentTaskTimerFromState() {
    try {
      if (this.state.currentTask && this.state.currentTask.startTime) {
        const currentTime = Date.now();
        const startTime = new Date(this.state.currentTask.startTime);
        const sessionDuration = currentTime - startTime.getTime();
        const totalDuration = this.state.currentTask.duration + sessionDuration;
        const formattedTime = this.formatDuration(totalDuration);
        
        const timerElement = document.getElementById('currentTaskTimer');
        if (timerElement) {
          timerElement.textContent = formattedTime;
        }
      }
    } catch (error) {
      console.error('Error updating current task timer from state:', error);
    }
  }

  updateCurrentTaskTimer(totalDuration, formattedTime) {
    try {
      const timerElement = document.getElementById('currentTaskTimer');
      if (timerElement) {
        timerElement.textContent = formattedTime;
      }
    } catch (error) {
      console.error('Error updating current task timer:', error);
    }
  }

  updateCustomerProjectDropdowns() {
    try {
      const customerSelect = document.getElementById('customerSelect');
      const projectSelect = document.getElementById('projectSelect');
      
      if (customerSelect) {
        customerSelect.innerHTML = '<option value="">Select Customer</option>' +
          this.state.customers.map(c => `<option value="${c}">${c}</option>`).join('');
        
        if (this.state.settings.defaultCustomer) {
          customerSelect.value = this.state.settings.defaultCustomer;
        }
      }
      
      if (projectSelect) {
        projectSelect.innerHTML = '<option value="">Select Project</option>' +
          this.state.projects.map(p => `<option value="${p}">${p}</option>`).join('');
        
        if (this.state.settings.defaultProject) {
          projectSelect.value = this.state.settings.defaultProject;
        }
      }
    } catch (error) {
      console.error('Error updating dropdowns:', error);
    }
  }

  updateSummary() {
    try {
      const now = new Date();
      const tasks = this.getTasksForPeriod(this.currentPeriod, now);
      
      let totalTime = tasks.reduce((sum, task) => sum + (Number(task.duration) || 0), 0);
      let billableTime = tasks.filter(task => task.billable).reduce((sum, task) => sum + (Number(task.duration) || 0), 0);
      
      // Add current task time if it's in the current period
      if (this.state.currentTask && this.isTaskInPeriod(this.state.currentTask.startTime, this.currentPeriod, now)) {
        const currentTime = Date.now();
        const startTime = new Date(this.state.currentTask.startTime);
        const sessionDuration = currentTime - startTime.getTime();
        const currentTaskTotalDuration = this.state.currentTask.duration + sessionDuration;
        
        totalTime += currentTaskTotalDuration;
        if (this.state.currentTask.billable) {
          billableTime += currentTaskTotalDuration;
        }
      }
      
      console.log('Summary update:', {
        period: this.currentPeriod,
        tasksCount: tasks.length,
        totalTime,
        billableTime,
        hasCurrentTask: !!this.state.currentTask
      });
      
      const totalTimeEl = document.getElementById('totalTime');
      const billableTimeEl = document.getElementById('billableTime');
      
      if (totalTimeEl) totalTimeEl.textContent = this.formatDuration(totalTime);
      if (billableTimeEl) billableTimeEl.textContent = this.formatDuration(billableTime);
    } catch (error) {
      console.error('Error updating summary:', error);
    }
  }

  updateTaskList() {
    try {
      const taskList = document.getElementById('taskList');
      if (!taskList) return;
      
      const recentTasks = this.state.tasks.slice(0, 10);
      
      if (recentTasks.length === 0) {
        taskList.innerHTML = '<div class="empty-state">No tasks yet. Start tracking your first task!</div>';
        return;
      }
      
      taskList.innerHTML = recentTasks.map(task => `
        <div class="task-item" data-task-id="${task.id}">
          <div class="task-item-info">
            <div class="task-item-title">${task.title}</div>
            <div class="task-item-meta">
              ${task.customer} • ${task.project}
              ${task.billable ? '<span class="billable-indicator">💰</span>' : ''}
            </div>
          </div>
          <div class="task-item-duration">${this.formatDuration(Number(task.duration) || 0)}</div>
        </div>
      `).join('');
      
      // Add click handlers for editing tasks
      taskList.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', () => {
          const taskId = parseInt(item.dataset.taskId);
          this.editTask(taskId);
        });
      });
    } catch (error) {
      console.error('Error updating task list:', error);
    }
  }

  getTasksForPeriod(period, date) {
    switch (period) {
      case 'today':
        return this.state.tasks.filter(task => this.isToday(task.startTime));
      case 'week':
        return this.state.tasks.filter(task => this.isThisWeek(task.startTime, date));
      case 'month':
        return this.state.tasks.filter(task => this.isThisMonth(task.startTime, date));
      default:
        return [];
    }
  }

  isTaskInPeriod(taskDate, period, referenceDate) {
    switch (period) {
      case 'today':
        return this.isToday(taskDate);
      case 'week':
        return this.isThisWeek(taskDate, referenceDate);
      case 'month':
        return this.isThisMonth(taskDate, referenceDate);
      default:
        return false;
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

  switchPeriod(period) {
    try {
      this.currentPeriod = period;
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.querySelector(`[data-period="${period}"]`);
      if (activeBtn) activeBtn.classList.add('active');
      this.updateSummary();
    } catch (error) {
      console.error('Error switching period:', error);
    }
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

  openSettings() {
    try {
      chrome.runtime.openOptionsPage();
    } catch (error) {
      console.error('Error opening settings:', error);
    }
  }

  editTask(taskId) {
    // This would open a task edit dialog
    console.log('Edit task:', taskId);
  }

  async exportTasks() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'exportTasks' }, resolve);
      });
      
      if (response && response.success) {
        const csvContent = response.data;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `time-tracker-export-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('Popup: Tasks exported successfully');
      } else {
        console.error('Popup: Failed to export tasks:', response);
        alert(response?.error || 'Failed to export tasks');
      }
    } catch (error) {
      console.error('Error exporting tasks:', error);
    }
  }

  handleKeyboard(e) {
    try {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'j':
            e.preventDefault();
            if (this.state.currentTask) {
              this.pauseTask();
            } else if (this.state.pausedTask) {
              this.resumeTask();
            }
            break;
          case 'k':
            e.preventDefault();
            if (this.state.currentTask) {
              this.stopTask();
            } else if (this.state.pausedTask) {
              this.stopPausedTask();
            }
            break;
          case 'Enter':
            e.preventDefault();
            if (!this.state.currentTask && !this.state.pausedTask) {
              const startBtn = document.getElementById('startBtn');
              if (startBtn && !startBtn.disabled) startBtn.click();
            }
            break;
        }
      }
    } catch (error) {
      console.error('Error handling keyboard:', error);
    }
  }
}

// Initialize when DOM is ready
console.log('Popup script loaded, waiting for DOM...');
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing TimeTracker popup...');
  try {
    new TimeTracker();
  } catch (error) {
    console.error('Failed to initialize TimeTracker popup:', error);
  }
});

// Also try to initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
  console.log('DOM is still loading, waiting...');
} else {
  console.log('DOM already loaded, initializing popup immediately...');
  try {
    new TimeTracker();
  } catch (error) {
    console.error('Failed to initialize TimeTracker popup immediately:', error);
  }
}