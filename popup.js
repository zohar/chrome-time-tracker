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
    
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.updateUI();
    this.startTimer();
  }

  async loadData() {
    const data = await chrome.storage.local.get([
      'currentTask',
      'pausedTask', 
      'tasks',
      'customers',
      'projects',
      'settings'
    ]);
    
    this.currentTask = data.currentTask || null;
    this.pausedTask = data.pausedTask || null;
    this.tasks = data.tasks || [];
    this.customers = data.customers || ['Default Client'];
    this.projects = data.projects || ['General'];
    this.settings = { ...this.settings, ...data.settings };
  }

  async saveData() {
    await chrome.storage.local.set({
      currentTask: this.currentTask,
      pausedTask: this.pausedTask,
      tasks: this.tasks,
      customers: this.customers,
      projects: this.projects,
      settings: this.settings
    });
  }

  setupEventListeners() {
    // Task controls
    document.getElementById('startBtn').addEventListener('click', () => this.startTask());
    document.getElementById('pauseBtn').addEventListener('click', () => this.pauseTask());
    document.getElementById('stopBtn').addEventListener('click', () => this.stopTask());
    document.getElementById('resumeBtn').addEventListener('click', () => this.resumeTask());
    document.getElementById('stopPausedBtn').addEventListener('click', () => this.stopPausedTask());
    
    // Form inputs
    document.getElementById('taskTitle').addEventListener('input', () => this.validateForm());
    document.getElementById('billableToggle').addEventListener('click', () => this.toggleBillable());
    
    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    
    // Summary tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchPeriod(e.target.dataset.period));
    });
    
    // Export
    document.getElementById('exportBtn').addEventListener('click', () => this.showExportDialog());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  validateForm() {
    const title = document.getElementById('taskTitle').value.trim();
    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = !title;
  }

  toggleBillable() {
    const toggle = document.getElementById('billableToggle');
    toggle.classList.toggle('active');
  }

  async startTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const customer = document.getElementById('customerSelect').value || this.customers[0];
    const project = document.getElementById('projectSelect').value || this.projects[0];
    const billable = document.getElementById('billableToggle').classList.contains('active');
    
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
    
    await this.saveData();
    this.updateUI();
    this.updateIcon('active');
    
    // Clear form
    document.getElementById('taskTitle').value = '';
    document.getElementById('billableToggle').classList.remove('active');
  }

  async pauseTask() {
    if (!this.currentTask) return;
    
    this.currentTask.duration += Date.now() - this.currentTask.startTime.getTime();
    this.pausedTask = { ...this.currentTask };
    this.currentTask = null;
    
    await this.saveData();
    this.updateUI();
    this.updateIcon('paused');
  }

  async stopTask() {
    if (!this.currentTask) return;
    
    this.currentTask.duration += Date.now() - this.currentTask.startTime.getTime();
    this.currentTask.endTime = new Date();
    
    this.tasks.unshift(this.currentTask);
    this.currentTask = null;
    
    await this.saveData();
    this.updateUI();
    this.updateIcon('idle');
    
    if (this.settings.webhookEnabled && this.settings.webhookUrl) {
      this.sendWebhook(this.tasks[0]);
    }
  }

  async resumeTask() {
    if (!this.pausedTask) return;
    
    this.currentTask = {
      ...this.pausedTask,
      id: Date.now(),
      startTime: new Date(),
      duration: this.pausedTask.duration
    };
    
    this.pausedTask = null;
    
    await this.saveData();
    this.updateUI();
    this.updateIcon('active');
  }

  async stopPausedTask() {
    if (!this.pausedTask) return;
    
    this.pausedTask.endTime = new Date();
    this.tasks.unshift(this.pausedTask);
    this.pausedTask = null;
    
    await this.saveData();
    this.updateUI();
    this.updateIcon('idle');
  }

  updateUI() {
    this.updateTaskStates();
    this.updateCustomerProjectDropdowns();
    this.updateSummary();
    this.updateTaskList();
  }

  updateTaskStates() {
    const currentTaskEl = document.getElementById('currentTask');
    const pausedTaskEl = document.getElementById('pausedTask');
    const startTaskEl = document.getElementById('startTask');
    
    if (this.currentTask) {
      currentTaskEl.style.display = 'block';
      pausedTaskEl.style.display = 'none';
      startTaskEl.style.display = 'none';
      
      document.getElementById('currentTaskTitle').textContent = this.currentTask.title;
      document.getElementById('currentTaskCustomer').textContent = this.currentTask.customer;
      document.getElementById('currentTaskProject').textContent = this.currentTask.project;
      document.getElementById('currentTaskBillable').style.display = this.currentTask.billable ? 'inline' : 'none';
      
    } else if (this.pausedTask) {
      currentTaskEl.style.display = 'none';
      pausedTaskEl.style.display = 'block';
      startTaskEl.style.display = 'none';
      
      document.getElementById('pausedTaskTitle').textContent = this.pausedTask.title;
      document.getElementById('pausedTaskCustomer').textContent = this.pausedTask.customer;
      document.getElementById('pausedTaskProject').textContent = this.pausedTask.project;
      document.getElementById('pausedTaskBillable').style.display = this.pausedTask.billable ? 'inline' : 'none';
      document.getElementById('pausedTaskTimer').textContent = this.formatDuration(this.pausedTask.duration);
      
    } else {
      currentTaskEl.style.display = 'none';
      pausedTaskEl.style.display = 'none';
      startTaskEl.style.display = 'block';
    }
  }

  updateCustomerProjectDropdowns() {
    const customerSelect = document.getElementById('customerSelect');
    const projectSelect = document.getElementById('projectSelect');
    
    customerSelect.innerHTML = '<option value="">Select Customer</option>' +
      this.customers.map(c => `<option value="${c}">${c}</option>`).join('');
    
    projectSelect.innerHTML = '<option value="">Select Project</option>' +
      this.projects.map(p => `<option value="${p}">${p}</option>`).join('');
    
    if (this.settings.defaultCustomer) {
      customerSelect.value = this.settings.defaultCustomer;
    }
    if (this.settings.defaultProject) {
      projectSelect.value = this.settings.defaultProject;
    }
  }

  updateSummary() {
    const now = new Date();
    const tasks = this.getTasksForPeriod(this.currentPeriod, now);
    
    const totalTime = tasks.reduce((sum, task) => sum + task.duration, 0);
    const billableTime = tasks.filter(task => task.billable).reduce((sum, task) => sum + task.duration, 0);
    
    if (this.currentTask && this.currentPeriod === 'today' && this.isToday(this.currentTask.startTime)) {
      const currentDuration = Date.now() - this.currentTask.startTime.getTime() + this.currentTask.duration;
      totalTime += currentDuration;
      if (this.currentTask.billable) {
        billableTime += currentDuration;
      }
    }
    
    document.getElementById('totalTime').textContent = this.formatDuration(totalTime);
    document.getElementById('billableTime').textContent = this.formatDuration(billableTime);
  }

  updateTaskList() {
    const taskList = document.getElementById('taskList');
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
            ${task.billable ? '<span class="billable-indicator">$</span>' : ''}
          </div>
        </div>
        <div class="task-item-duration">${this.formatDuration(task.duration)}</div>
      </div>
    `).join('');
    
    // Add click handlers for editing tasks
    taskList.querySelectorAll('.task-item').forEach(item => {
      item.addEventListener('click', () => {
        const taskId = parseInt(item.dataset.taskId);
        this.editTask(taskId);
      });
    });
  }

  startTimer() {
    setInterval(() => {
      if (this.currentTask) {
        const totalDuration = Date.now() - this.currentTask.startTime.getTime() + this.currentTask.duration;
        document.getElementById('currentTaskTimer').textContent = this.formatDuration(totalDuration);
        this.updateSummary();
      }
    }, 1000);
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
    this.currentPeriod = period;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-period="${period}"]`).classList.add('active');
    this.updateSummary();
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  updateIcon(state) {
    chrome.runtime.sendMessage({
      action: 'updateIcon',
      state: state
    });
  }

  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  editTask(taskId) {
    // This would open a task edit dialog
    console.log('Edit task:', taskId);
  }

  showExportDialog() {
    // This would show export options dialog
    console.log('Show export dialog');
  }

  handleKeyboard(e) {
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
            document.getElementById('startBtn').click();
          }
          break;
      }
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
document.addEventListener('DOMContentLoaded', () => {
  new TimeTracker();
});