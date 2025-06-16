class TimeTracker {
  constructor() {
    this.currentTask = null;
    this.pausedTask = null;
    this.tasks = [];
    this.customers = [];
    this.projects = [];
    this.settings = {
      defaultCustomer: '',
      defaultProject: '',
      webhookUrl: '',
      webhookEnabled: false
    };
    this.currentPeriod = 'today';
    this.timerInterval = null;
    
    console.log('TimeTracker constructor called');
    this.init();
  }

  async init() {
    try {
      console.log('Initializing TimeTracker...');
      await this.loadData();
      this.setupEventListeners();
      this.updateUI();
      this.startTimer();
      console.log('TimeTracker initialized successfully');
    } catch (error) {
      console.error('Error initializing TimeTracker:', error);
    }
  }

  async loadData() {
    try {
      console.log('Loading data from storage...');
      const data = await chrome.storage.local.get([
        'currentTask',
        'pausedTask', 
        'tasks',
        'customers',
        'projects',
        'settings'
      ]);
      
      console.log('Raw data from storage:', data);
      
      this.currentTask = data.currentTask || null;
      this.pausedTask = data.pausedTask || null;
      this.tasks = data.tasks || [];
      this.customers = data.customers || ['Default Client'];
      this.projects = data.projects || ['General'];
      this.settings = { ...this.settings, ...data.settings };

      // Convert date strings back to Date objects and ensure proper format
      if (this.currentTask) {
        console.log('Processing current task:', this.currentTask);
        if (this.currentTask.startTime) {
          this.currentTask.startTime = new Date(this.currentTask.startTime);
        }
        // Ensure duration is a number
        this.currentTask.duration = Number(this.currentTask.duration) || 0;
        console.log('Processed current task:', this.currentTask);
      }
      
      if (this.pausedTask) {
        console.log('Processing paused task:', this.pausedTask);
        if (this.pausedTask.startTime) {
          this.pausedTask.startTime = new Date(this.pausedTask.startTime);
        }
        // Ensure duration is a number
        this.pausedTask.duration = Number(this.pausedTask.duration) || 0;
        console.log('Processed paused task:', this.pausedTask);
      }
      
      this.tasks = this.tasks.map(task => {
        const processedTask = {
          ...task,
          startTime: new Date(task.startTime),
          endTime: task.endTime ? new Date(task.endTime) : null,
          duration: Number(task.duration) || 0
        };
        return processedTask;
      });

      console.log('Final loaded data:', {
        currentTask: this.currentTask,
        pausedTask: this.pausedTask,
        tasksCount: this.tasks.length,
        customers: this.customers,
        projects: this.projects
      });
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        currentTask: this.currentTask,
        pausedTask: this.pausedTask,
        tasks: this.tasks,
        customers: this.customers,
        projects: this.projects,
        settings: this.settings
      });
      console.log('Data saved successfully');
    } catch (error) {
      console.error('Error saving data:', error);
    }
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
      const customer = customerSelect ? customerSelect.value || this.customers[0] : this.customers[0];
      const project = projectSelect ? projectSelect.value || this.projects[0] : this.projects[0];
      const billable = billableToggle ? billableToggle.classList.contains('active') : false;
      
      if (!title) return;
      
      this.currentTask = {
        id: Date.now(),
        title,
        customer,
        project,
        billable,
        startTime: new Date(),
        duration: 0
      };
      
      console.log('Started task:', this.currentTask);
      
      await this.saveData();
      this.updateUI();
      this.updateIcon('active');
      
      // Clear form
      titleInput.value = '';
      if (billableToggle) billableToggle.classList.remove('active');
      this.validateForm();
    } catch (error) {
      console.error('Error starting task:', error);
    }
  }

  async pauseTask() {
    try {
      if (!this.currentTask) return;
      
      const currentTime = Date.now();
      const sessionDuration = currentTime - this.currentTask.startTime.getTime();
      this.currentTask.duration += sessionDuration;
      
      this.pausedTask = { ...this.currentTask };
      this.currentTask = null;
      
      console.log('Paused task:', this.pausedTask);
      
      await this.saveData();
      this.updateUI();
      this.updateIcon('paused');
    } catch (error) {
      console.error('Error pausing task:', error);
    }
  }

  async stopTask() {
    try {
      if (!this.currentTask) return;
      
      const currentTime = Date.now();
      const sessionDuration = currentTime - this.currentTask.startTime.getTime();
      this.currentTask.duration += sessionDuration;
      this.currentTask.endTime = new Date();
      
      console.log('Stopped task:', this.currentTask);
      
      this.tasks.unshift(this.currentTask);
      this.currentTask = null;
      
      await this.saveData();
      this.updateUI();
      this.updateIcon('idle');
      
      if (this.settings.webhookEnabled && this.settings.webhookUrl) {
        this.sendWebhook(this.tasks[0]);
      }
    } catch (error) {
      console.error('Error stopping task:', error);
    }
  }

  async resumeTask() {
    try {
      if (!this.pausedTask) return;
      
      this.currentTask = {
        ...this.pausedTask,
        id: Date.now(),
        startTime: new Date()
        // Keep the existing duration from paused task
      };
      
      this.pausedTask = null;
      
      console.log('Resumed task:', this.currentTask);
      
      await this.saveData();
      this.updateUI();
      this.updateIcon('active');
    } catch (error) {
      console.error('Error resuming task:', error);
    }
  }

  async stopPausedTask() {
    try {
      if (!this.pausedTask) return;
      
      this.pausedTask.endTime = new Date();
      this.tasks.unshift(this.pausedTask);
      this.pausedTask = null;
      
      await this.saveData();
      this.updateUI();
      this.updateIcon('idle');
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
        hasCurrentTask: !!this.currentTask,
        hasPausedTask: !!this.pausedTask
      });
      
      if (this.currentTask) {
        if (currentTaskEl) currentTaskEl.style.display = 'block';
        if (pausedTaskEl) pausedTaskEl.style.display = 'none';
        if (startTaskEl) startTaskEl.style.display = 'none';
        
        const titleEl = document.getElementById('currentTaskTitle');
        const customerEl = document.getElementById('currentTaskCustomer');
        const projectEl = document.getElementById('currentTaskProject');
        const billableEl = document.getElementById('currentTaskBillable');
        
        if (titleEl) titleEl.textContent = this.currentTask.title;
        if (customerEl) customerEl.textContent = this.currentTask.customer;
        if (projectEl) projectEl.textContent = this.currentTask.project;
        if (billableEl) billableEl.style.display = this.currentTask.billable ? 'inline-flex' : 'none';
        
        // Update timer immediately
        this.updateCurrentTaskTimer();
        
      } else if (this.pausedTask) {
        if (currentTaskEl) currentTaskEl.style.display = 'none';
        if (pausedTaskEl) pausedTaskEl.style.display = 'block';
        if (startTaskEl) startTaskEl.style.display = 'none';
        
        const titleEl = document.getElementById('pausedTaskTitle');
        const customerEl = document.getElementById('pausedTaskCustomer');
        const projectEl = document.getElementById('pausedTaskProject');
        const billableEl = document.getElementById('pausedTaskBillable');
        const timerEl = document.getElementById('pausedTaskTimer');
        
        if (titleEl) titleEl.textContent = this.pausedTask.title;
        if (customerEl) customerEl.textContent = this.pausedTask.customer;
        if (projectEl) projectEl.textContent = this.pausedTask.project;
        if (billableEl) billableEl.style.display = this.pausedTask.billable ? 'inline-flex' : 'none';
        if (timerEl) timerEl.textContent = this.formatDuration(this.pausedTask.duration);
        
      } else {
        if (currentTaskEl) currentTaskEl.style.display = 'none';
        if (pausedTaskEl) pausedTaskEl.style.display = 'none';
        if (startTaskEl) startTaskEl.style.display = 'block';
      }
    } catch (error) {
      console.error('Error updating task states:', error);
    }
  }

  updateCurrentTaskTimer() {
    try {
      if (this.currentTask && this.currentTask.startTime) {
        const currentTime = Date.now();
        const sessionDuration = currentTime - this.currentTask.startTime.getTime();
        const totalDuration = this.currentTask.duration + sessionDuration;
        const formattedTime = this.formatDuration(totalDuration);
        
        console.log('Timer update:', {
          sessionDuration,
          totalDuration,
          formattedTime,
          startTime: this.currentTask.startTime
        });
        
        const timerElement = document.getElementById('currentTaskTimer');
        if (timerElement) {
          timerElement.textContent = formattedTime;
        }
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
          this.customers.map(c => `<option value="${c}">${c}</option>`).join('');
        
        if (this.settings.defaultCustomer) {
          customerSelect.value = this.settings.defaultCustomer;
        }
      }
      
      if (projectSelect) {
        projectSelect.innerHTML = '<option value="">Select Project</option>' +
          this.projects.map(p => `<option value="${p}">${p}</option>`).join('');
        
        if (this.settings.defaultProject) {
          projectSelect.value = this.settings.defaultProject;
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
      if (this.currentTask && this.isTaskInPeriod(this.currentTask.startTime, this.currentPeriod, now)) {
        const currentTime = Date.now();
        const sessionDuration = currentTime - this.currentTask.startTime.getTime();
        const currentTaskTotalDuration = this.currentTask.duration + sessionDuration;
        
        totalTime += currentTaskTotalDuration;
        if (this.currentTask.billable) {
          billableTime += currentTaskTotalDuration;
        }
      }
      
      console.log('Summary update:', {
        period: this.currentPeriod,
        tasksCount: tasks.length,
        totalTime,
        billableTime,
        hasCurrentTask: !!this.currentTask
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
      
      const recentTasks = this.tasks.slice(0, 10);
      
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

  startTimer() {
    try {
      // Clear any existing timer
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
      }
      
      console.log('Starting timer...');
      this.timerInterval = setInterval(() => {
        if (this.currentTask) {
          this.updateCurrentTaskTimer();
          this.updateSummary();
        }
      }, 1000);
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  }

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

  updateIcon(state) {
    try {
      chrome.runtime.sendMessage({
        action: 'updateIcon',
        state: state
      });
    } catch (error) {
      console.error('Error updating icon:', error);
    }
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

  exportTasks() {
    try {
      if (this.tasks.length === 0) {
        alert('No tasks to export.');
        return;
      }

      const csvContent = this.generateCSV(this.tasks);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `time-tracker-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting tasks:', error);
    }
  }

  generateCSV(tasks) {
    const headers = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)'];
    const rows = tasks.map(task => {
      // Ensure we have valid dates
      const startTime = task.startTime instanceof Date ? task.startTime : new Date(task.startTime);
      const endTime = task.endTime ? (task.endTime instanceof Date ? task.endTime : new Date(task.endTime)) : null;
      
      return [
        `"${task.title.replace(/"/g, '""')}"`,
        `"${task.customer}"`,
        `"${task.project}"`,
        task.billable ? 'Y' : 'N',
        startTime.toISOString(),
        endTime ? endTime.toISOString() : '',
        Math.floor((Number(task.duration) || 0) / 1000)
      ];
    });
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  handleKeyboard(e) {
    try {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'j':
            e.preventDefault();
            if (this.currentTask) {
              this.pauseTask();
            } else if (this.pausedTask) {
              this.resumeTask();
            }
            break;
          case 'k':
            e.preventDefault();
            if (this.currentTask) {
              this.stopTask();
            } else if (this.pausedTask) {
              this.stopPausedTask();
            }
            break;
          case 'Enter':
            e.preventDefault();
            if (!this.currentTask && !this.pausedTask) {
              const startBtn = document.getElementById('startBtn');
              if (startBtn) startBtn.click();
            }
            break;
        }
      }
    } catch (error) {
      console.error('Error handling keyboard:', error);
    }
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
    } catch (error) {
      console.error('Webhook failed:', error);
    }
  }
}

// Initialize when DOM is ready
console.log('Script loaded, waiting for DOM...');
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing TimeTracker...');
  try {
    new TimeTracker();
  } catch (error) {
    console.error('Failed to initialize TimeTracker:', error);
  }
});

// Also try to initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
  console.log('DOM is still loading, waiting...');
} else {
  console.log('DOM already loaded, initializing immediately...');
  try {
    new TimeTracker();
  } catch (error) {
    console.error('Failed to initialize TimeTracker immediately:', error);
  }
}