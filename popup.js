class TimeTracker {
  constructor() {
    // UI-only state - no persistent data stored here
    this.currentPeriod = 'today';
    this.editingTask = null;
    this.lastEditedField = null; // Track which field was last edited
    this.tasksDisplayed = 10; // Track how many tasks are currently displayed
    this.state = {
      currentTask: null,
      pausedTask: null,
      tasks: [],
      customers: ['Default Client'],
      projects: ['General'],
      settings: {
        defaultCustomer: '',
        defaultProject: '',
        defaultBillable: false,
        webhookUrl: '',
        webhookEnabled: false
      }
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadInitialState();
      this.setupEventListeners();
      this.setupMessageListener();
      this.updateUI();
    } catch (error) {
      console.error('Error initializing TimeTracker popup:', error);
    }
  }

  async loadInitialState() {
    const maxRetries = 5; // Increased retries
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        
        // Try to wake up the service worker if it's the first attempt
        if (retryCount === 0) {
          await this.wakeUpServiceWorker();
        }
        
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for background response'));
          }, 8000); // Increased timeout to 8 seconds
          
          chrome.runtime.sendMessage({ action: 'getInitialState' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        if (response && response.success) {
          this.state = response.data;
          return; // Success, exit retry loop
        } else {
          throw new Error(response?.error || 'Invalid response from background');
        }
      } catch (error) {
        console.error(`Popup: Error loading initial state (attempt ${retryCount + 1}):`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          // Try to wake up service worker on communication errors
          if (error.message.includes('Could not establish connection') || 
              error.message.includes('Receiving end does not exist')) {
            await this.wakeUpServiceWorker();
          }
          
          // Wait before retrying, with exponential backoff
          const delay = Math.pow(2, retryCount) * 500; // 1s, 2s, 4s, 8s, 16s
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Popup: Failed to load initial state after all retries');
          // Continue with default state
        }
      }
    }
  }

  async wakeUpServiceWorker() {
    try {
      // Try to wake up the service worker with a simple ping
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
          } else {
          }
          resolve();
        });
        
        // Don't wait too long for the ping response
        setTimeout(resolve, 500);
      });
    } catch (error) {
    }
  }

  setupMessageListener() {
    // Listen for state updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      
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
      
      // Edit buttons
      const editCurrentBtn = document.getElementById('editCurrentBtn');
      const editPausedBtn = document.getElementById('editPausedBtn');
      
      if (editCurrentBtn) editCurrentBtn.addEventListener('click', () => this.editCurrentTask());
      if (editPausedBtn) editPausedBtn.addEventListener('click', () => this.editPausedTask());
      
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
      
      // Load More Tasks and Task List interactions (using event delegation)
      document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'loadMoreBtn') {
          this.loadMoreTasks();
        }
        
        // Handle task item clicks for editing
        const taskInfo = e.target.closest('.task-item-info');
        if (taskInfo) {
          const taskItem = taskInfo.closest('.task-item');
          if (taskItem) {
            const taskId = parseFloat(taskItem.dataset.taskId);
            if (taskId) {
              this.editTask(taskId);
            }
          }
        }
        
        // Handle play button clicks
        const playBtn = e.target.closest('.task-play-btn');
        if (playBtn) {
          e.stopPropagation();
          const taskId = parseFloat(playBtn.dataset.taskId);
          if (taskId) {
            this.restartTask(taskId);
          }
        }
        
        // Handle delete button clicks
        if (e.target.classList.contains('task-delete-btn')) {
          e.stopPropagation();
          const taskId = parseFloat(e.target.dataset.taskId);
          if (taskId) {
            this.deleteTaskDirectly(taskId);
          }
        }
      });
      
      // Modal controls
      const closeModal = document.getElementById('closeModal');
      const cancelEditBtn = document.getElementById('cancelEditBtn');
      const saveTaskBtn = document.getElementById('saveTaskBtn');
      const deleteTaskBtn = document.getElementById('deleteTaskBtn');
      
      if (closeModal) closeModal.addEventListener('click', () => this.closeEditModal());
      if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => this.closeEditModal());
      if (saveTaskBtn) saveTaskBtn.addEventListener('click', () => this.saveTaskEdit());
      if (deleteTaskBtn) deleteTaskBtn.addEventListener('click', () => this.deleteTask());
      
      // Close modal on backdrop click
      const modal = document.getElementById('editModal');
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.closeEditModal();
          }
        });
      }
      
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => this.handleKeyboard(e));
      
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }

  setupEditModalTimeListeners() {
    try {
      const editStartTime = document.getElementById('editStartTime');
      const editEndTime = document.getElementById('editEndTime');
      const editDuration = document.getElementById('editDuration');
      
      if (editStartTime && editEndTime && editDuration) {
        // Listen for changes in all three fields
        editStartTime.addEventListener('input', () => {
          this.lastEditedField = 'start';
          this.handleEditTimeChange();
        });
        
        editEndTime.addEventListener('input', () => {
          this.lastEditedField = 'end';
          this.handleEditTimeChange();
        });
        
        editDuration.addEventListener('input', () => {
          this.lastEditedField = 'duration';
          this.handleEditTimeChange();
        });
        
        // Duration field now uses native time input - no custom keyboard handling needed
        
      }
    } catch (error) {
      console.error('Error setting up edit modal time listeners:', error);
    }
  }


  handleEditTimeChange() {
    try {
      const editStartTime = document.getElementById('editStartTime');
      const editEndTime = document.getElementById('editEndTime');
      const editDuration = document.getElementById('editDuration');
      
      if (!editStartTime || !editEndTime || !editDuration) return;
      
      const startTimeStr = editStartTime.value;
      const endTimeStr = editEndTime.value;
      const durationStr = editDuration.value;
      
      // Parse values
      const startTime = startTimeStr ? new Date(startTimeStr) : null;
      const endTime = endTimeStr ? new Date(endTimeStr) : null;
      const duration = this.parseDurationInput(durationStr);
      
      // Calculate based on which field was last edited
      if (this.lastEditedField === 'duration') {
        // Duration changed - move start time back or forth from end time
        if (endTime && !isNaN(endTime.getTime()) && duration !== null && duration >= 0) {
          const calculatedStartTime = new Date(endTime.getTime() - duration);
          editStartTime.value = this.formatDateTimeLocal(calculatedStartTime);
        } else if (!endTimeStr || !durationStr) {
          editStartTime.value = '';
        }
      } else if (this.lastEditedField === 'start') {
        // Start time changed - calculate duration if we have end time
        if (startTime && endTime && !isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          let calculatedDuration = endTime.getTime() - startTime.getTime();
          
          // Cross-midnight handling: if start time is after end time, assume previous day
          if (calculatedDuration < 0) {
            // Add 24 hours to handle cross-midnight scenario
            calculatedDuration += 24 * 60 * 60 * 1000;
          }
          
          editDuration.value = this.formatDurationForInput(calculatedDuration);
        } else if (!startTimeStr || !endTimeStr) {
          editDuration.value = '00:00:00';
        }
      } else if (this.lastEditedField === 'end') {
        // End time changed - calculate duration if we have start time
        if (startTime && endTime && !isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          let calculatedDuration = endTime.getTime() - startTime.getTime();
          
          // Cross-midnight handling: if start time is after end time, assume previous day
          if (calculatedDuration < 0) {
            // Add 24 hours to handle cross-midnight scenario
            calculatedDuration += 24 * 60 * 60 * 1000;
          }
          
          editDuration.value = this.formatDurationForInput(calculatedDuration);
        } else if (!startTimeStr || !endTimeStr) {
          editDuration.value = '00:00:00';
        }
      }
    } catch (error) {
      console.error('Error handling edit time change:', error);
    }
  }

  validateForm() {
    try {
      const titleInput = document.getElementById('taskTitle');
      const startBtn = document.getElementById('startBtn');
      
      if (titleInput && startBtn) {
        // Always enable the start button - allow starting without a title
        startBtn.disabled = false;
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

  async sendMessageWithRetry(message, maxRetries = 3) {
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for response'));
          }, 5000); // Increased timeout
          
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        return response; // Success
      } catch (error) {
        console.error(`Message failed (attempt ${retryCount + 1}):`, error);
        retryCount++;
        
        if (retryCount <= maxRetries) {
          // Try to wake up service worker on communication errors
          if (error.message.includes('Could not establish connection') || 
              error.message.includes('Receiving end does not exist')) {
            await this.wakeUpServiceWorker();
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }
  }

  async startTask() {
    try {
      const titleInput = document.getElementById('taskTitle');
      const customerSelect = document.getElementById('customerSelect');
      const projectSelect = document.getElementById('projectSelect');
      const billableToggle = document.getElementById('billableToggle');
      
      if (!titleInput) return;
      
      const titleInput_value = titleInput.value.trim();
      const title = titleInput_value || 'Untitled task';
      // Allow empty customer and project - don't default to first item
      const customer = customerSelect ? customerSelect.value : '';
      const project = projectSelect ? projectSelect.value : '';
      
      // Use billable toggle state or default setting
      let billable = false;
      if (billableToggle) {
        billable = billableToggle.classList.contains('active');
      } else {
        billable = this.state.settings.defaultBillable || false;
      }
      
      
      const response = await this.sendMessageWithRetry({
        action: 'startTask',
        data: { title, customer, project, billable }
      });
      
      if (response && response.success) {
        
        // Clear form
        titleInput.value = '';
        if (billableToggle) billableToggle.classList.remove('active');
        this.validateForm();
      } else {
        console.error('Popup: Failed to start task:', response);
        alert('Failed to start task. Please try again.');
      }
    } catch (error) {
      console.error('Error starting task:', error);
      alert('Failed to start task. Please try again.');
    }
  }

  async pauseTask() {
    try {
      const response = await this.sendMessageWithRetry({ action: 'pauseTask' });
      
      if (response && response.success) {
      } else {
        console.error('Popup: Failed to pause task:', response);
        alert('Failed to pause task. Please try again.');
      }
    } catch (error) {
      console.error('Error pausing task:', error);
      alert('Failed to pause task. Please try again.');
    }
  }

  async stopTask() {
    try {
      const response = await this.sendMessageWithRetry({ action: 'stopTask' });
      
      if (response && response.success) {
      } else {
        console.error('Popup: Failed to stop task:', response);
        alert('Failed to stop task. Please try again.');
      }
    } catch (error) {
      console.error('Error stopping task:', error);
      alert('Failed to stop task. Please try again.');
    }
  }

  async resumeTask() {
    try {
      const response = await this.sendMessageWithRetry({ action: 'resumeTask' });
      
      if (response && response.success) {
      } else {
        console.error('Popup: Failed to resume task:', response);
        alert('Failed to resume task. Please try again.');
      }
    } catch (error) {
      console.error('Error resuming task:', error);
      alert('Failed to resume task. Please try again.');
    }
  }

  async stopPausedTask() {
    try {
      const response = await this.sendMessageWithRetry({ action: 'stopPausedTask' });
      
      if (response && response.success) {
      } else {
        console.error('Popup: Failed to stop paused task:', response);
        alert('Failed to stop paused task. Please try again.');
      }
    } catch (error) {
      console.error('Error stopping paused task:', error);
      alert('Failed to stop paused task. Please try again.');
    }
  }

  async restartTask(taskId) {
    try {
      const task = this.state.tasks.find(t => t.id === taskId);
      if (!task) {
        console.error('Task not found for restart:', taskId);
        return;
      }
      
      const response = await this.sendMessageWithRetry({
        action: 'restartTask',
        data: {
          title: task.title,
          customer: task.customer || '',
          project: task.project || '',
          billable: task.billable || false
        }
      });
      
      if (response && response.success) {
      } else {
        console.error('Popup: Failed to restart task:', response);
        alert('Failed to restart task. Please try again.');
      }
    } catch (error) {
      console.error('Error restarting task:', error);
      alert('Failed to restart task. Please try again.');
    }
  }

  editCurrentTask() {
    if (this.state.currentTask) {
      this.openEditModal(this.state.currentTask, 'current');
    }
  }

  editPausedTask() {
    if (this.state.pausedTask) {
      this.openEditModal(this.state.pausedTask, 'paused');
    }
  }

  editTask(taskId) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (task) {
      this.openEditModal(task, 'completed');
    }
  }

  openEditModal(task, taskType) {
    try {
      this.editingTask = { ...task, taskType };
      this.lastEditedField = null; // Reset last edited field
      
      // Populate form fields
      document.getElementById('editTaskTitle').value = task.title || '';
      document.getElementById('editBillable').checked = task.billable || false;
      
      // Update datalists
      this.populateEditDatalists();
      
      // Set selected values
      document.getElementById('editCustomerInput').value = task.customer || '';
      document.getElementById('editProjectInput').value = task.project || '';
      
      // For current tasks, calculate current duration including active time
      let currentDuration = Number(task.duration) || 0;
      let startTime = task.startTime;
      
      if (taskType === 'current' && task.startTime) {
        // Add current session time to stored duration
        const now = Date.now();
        const sessionStart = new Date(task.startTime).getTime();
        if (!isNaN(sessionStart)) {
          const sessionDuration = now - sessionStart;
          currentDuration += sessionDuration;
        }
      }
      
      // Set start time
      if (startTime) {
        const startTimeObj = new Date(startTime);
        if (!isNaN(startTimeObj.getTime())) {
          document.getElementById('editStartTime').value = this.formatDateTimeLocal(startTimeObj);
        }
      }
      
      // Set duration
      document.getElementById('editDuration').value = this.formatDurationForInput(currentDuration);
      
      // Calculate and set end time based on start time + duration
      if (startTime && currentDuration > 0) {
        const endTime = new Date(new Date(startTime).getTime() + currentDuration);
        document.getElementById('editEndTime').value = this.formatDateTimeLocal(endTime);
      }
      
      // Show modal
      document.getElementById('editModal').style.display = 'flex';
      
      // Set up time field listeners after modal is shown and populated
      this.setupEditModalTimeListeners();
      
      // Focus on title field
      setTimeout(() => {
        document.getElementById('editTaskTitle').focus();
      }, 100);
      
    } catch (error) {
      console.error('Error opening edit modal:', error);
    }
  }

  populateEditDatalists() {
    try {
      const customerDatalist = document.getElementById('editCustomerDatalist');
      const projectDatalist = document.getElementById('editProjectDatalist');
      
      if (customerDatalist) {
        customerDatalist.innerHTML = this.state.customers.map(c => {
          const parsed = this.parseNameAndRate(c);
          return `<option value="${parsed.name}">${parsed.name}</option>`;
        }).join('');
      }
      
      if (projectDatalist) {
        projectDatalist.innerHTML = this.state.projects.map(p => {
          const parsed = this.parseNameAndRate(p);
          return `<option value="${parsed.name}">${parsed.name}</option>`;
        }).join('');
      }
    } catch (error) {
      console.error('Error populating edit datalists:', error);
    }
  }

  closeEditModal() {
    try {
      document.getElementById('editModal').style.display = 'none';
      this.editingTask = null;
      this.lastEditedField = null;
    } catch (error) {
      console.error('Error closing edit modal:', error);
    }
  }

  async saveTaskEdit() {
    try {
      if (!this.editingTask) return;
      
      // Get form values
      const title = document.getElementById('editTaskTitle').value.trim();
      const customer = document.getElementById('editCustomerInput').value.trim();
      const project = document.getElementById('editProjectInput').value.trim();
      const billable = document.getElementById('editBillable').checked;
      const startTimeStr = document.getElementById('editStartTime').value;
      const endTimeStr = document.getElementById('editEndTime').value;
      const durationStr = document.getElementById('editDuration').value;
      
      if (!title) {
        alert('Task title is required');
        return;
      }
      
      // Parse start time
      let startTime = null;
      if (startTimeStr) {
        startTime = new Date(startTimeStr);
        if (isNaN(startTime.getTime())) {
          alert('Invalid start time');
          return;
        }
      }
      
      // Parse end time
      let endTime = null;
      if (endTimeStr) {
        endTime = new Date(endTimeStr);
        if (isNaN(endTime.getTime())) {
          alert('Invalid end time');
          return;
        }
      }
      
      // Parse duration
      let duration = 0;
      if (durationStr) {
        duration = this.parseDurationInput(durationStr);
        if (duration === null) {
          alert('Invalid duration format. Use HH:MM:SS (e.g., 01:30:00)');
          return;
        }
        
        // Allow unlimited duration for cross-midnight tasks
      }
      
      // Check if customer or project are new and need to be added
      let updatedCustomers = [...this.state.customers];
      let updatedProjects = [...this.state.projects];
      let needsSettingsUpdate = false;
      
      if (customer && !this.findExistingEntry(this.state.customers, customer)) {
        updatedCustomers = this.addUniqueEntry(updatedCustomers, customer);
        needsSettingsUpdate = true;
      }
      
      if (project && !this.findExistingEntry(this.state.projects, project)) {
        updatedProjects = this.addUniqueEntry(updatedProjects, project);
        needsSettingsUpdate = true;
      }
      
      // Calculate final duration based on task type
      let finalDuration = duration;
      
      if (this.editingTask.taskType === 'current') {
        // For running tasks: let background handle timing - just send 0 duration
        finalDuration = 0;
      } else if (startTime && endTime) {
        // For completed tasks: calculate from timestamps
        let calculatedDuration = endTime.getTime() - startTime.getTime();
        // Handle cross-midnight scenarios
        if (calculatedDuration < 0) {
          calculatedDuration += 24 * 60 * 60 * 1000;
        }
        finalDuration = calculatedDuration;
      }
      
      let taskData = {
        ...this.editingTask,
        title,
        customer,
        project,
        billable,
        startTime: startTime || this.editingTask.startTime,
        endTime: this.editingTask.taskType === 'current' ? null : endTime, // Running tasks have no end time
        duration: finalDuration
      };
      
      // Send update to background
      const response = await this.sendMessageWithRetry({
        action: 'updateTask',
        data: {
          task: taskData,
          taskType: this.editingTask.taskType
        }
      });
      
      if (response && response.success) {
        
        // Update settings if new customers or projects were added
        if (needsSettingsUpdate) {
          await this.sendMessageWithRetry({
            action: 'updateSettings',
            data: {
              customers: updatedCustomers,
              projects: updatedProjects,
              settings: this.state.settings
            }
          });
        }
        
        this.closeEditModal();
        // Force UI update to reflect changes immediately
        await this.loadInitialState();
        this.updateUI();
      } else {
        console.error('Popup: Failed to update task:', response);
        alert('Failed to update task. Please try again.');
      }
      
    } catch (error) {
      console.error('Error saving task edit:', error);
      alert('Failed to save changes. Please try again.');
    }
  }

  async deleteTask() {
    try {
      if (!this.editingTask) return;
      
      if (!confirm('Are you sure you want to delete this task? This cannot be undone.')) {
        return;
      }
      
      const response = await this.sendMessageWithRetry({
        action: 'deleteTask',
        data: {
          taskId: this.editingTask.id,
          taskType: this.editingTask.taskType
        }
      });
      
      if (response && response.success) {
        this.closeEditModal();
        // Force UI update to reflect changes immediately
        await this.loadInitialState();
        this.updateUI();
      } else {
        console.error('Popup: Failed to delete task:', response);
        alert('Failed to delete task. Please try again.');
      }
      
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task. Please try again.');
    }
  }

  async deleteTaskDirectly(taskId) {
    try {
      if (!confirm('Are you sure you want to delete this task? This cannot be undone.')) {
        return;
      }
      
      const response = await this.sendMessageWithRetry({
        action: 'deleteTask',
        data: {
          taskId: taskId,
          taskType: 'completed'
        }
      });
      
      if (response && response.success) {
        // Force UI update to reflect changes immediately
        await this.loadInitialState();
        this.updateUI();
      } else {
        console.error('Popup: Failed to delete task:', response?.error || 'Unknown error');
        alert(`Failed to delete task: ${response?.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Error deleting task directly:', error);
      alert(`Failed to delete task: ${error.message}`);
    }
  }

  formatDateTimeLocal(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  formatDurationForInput(ms) {
    if (!ms || isNaN(ms) || ms < 0) {
      return '00:00:00';
    }
    
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    // Return in HH:MM:SS format for time input
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  parseDurationInput(durationStr) {
    const match = durationStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    
    // Validate ranges (allow longer hours for duration)
    if (minutes >= 60 || seconds >= 60) return null;
    
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  updateUI() {
    try {
      this.updateTaskStates();
      this.updateCustomerProjectDropdowns();
      this.updateSummary();
      this.updateTaskList();
      this.applyDefaultBillable();
    } catch (error) {
      console.error('Error updating UI:', error);
    }
  }

  applyDefaultBillable() {
    try {
      const billableToggle = document.getElementById('billableToggle');
      if (billableToggle && this.state.settings.defaultBillable) {
        billableToggle.classList.add('active');
      }
    } catch (error) {
      console.error('Error applying default billable:', error);
    }
  }

  updateTaskStates() {
    try {
      const currentTaskEl = document.getElementById('currentTask');
      const pausedTaskEl = document.getElementById('pausedTask');
      const startTaskEl = document.getElementById('startTask');
      
      if (this.state.currentTask) {
        if (currentTaskEl) currentTaskEl.style.display = 'block';
        if (pausedTaskEl) pausedTaskEl.style.display = 'none';
        if (startTaskEl) startTaskEl.style.display = 'none';
        
        const titleEl = document.getElementById('currentTaskTitle');
        const customerEl = document.getElementById('currentTaskCustomer');
        const projectEl = document.getElementById('currentTaskProject');
        const billableEl = document.getElementById('currentTaskBillable');
        
        if (titleEl) titleEl.textContent = this.state.currentTask.title;
        if (customerEl) {
          const customerName = this.state.currentTask.customer ? 
            this.parseNameAndRate(this.state.currentTask.customer).name : 'No Customer';
          customerEl.textContent = customerName;
        }
        if (projectEl) {
          const projectName = this.state.currentTask.project ? 
            this.parseNameAndRate(this.state.currentTask.project).name : 'No Project';
          projectEl.textContent = projectName;
        }
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
        if (customerEl) {
          const customerName = this.state.pausedTask.customer ? 
            this.parseNameAndRate(this.state.pausedTask.customer).name : 'No Customer';
          customerEl.textContent = customerName;
        }
        if (projectEl) {
          const projectName = this.state.pausedTask.project ? 
            this.parseNameAndRate(this.state.pausedTask.project).name : 'No Project';
          projectEl.textContent = projectName;
        }
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
        
        if (isNaN(startTime.getTime())) {
          console.warn('Invalid start time for current task');
          return;
        }
        
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
          this.state.customers.map(c => {
            const parsed = this.parseNameAndRate(c);
            return `<option value="${parsed.name}">${parsed.name}</option>`;
          }).join('');
        
        if (this.state.settings.defaultCustomer) {
          const defaultParsed = this.parseNameAndRate(this.state.settings.defaultCustomer);
          customerSelect.value = defaultParsed.name;
        }
      }
      
      if (projectSelect) {
        projectSelect.innerHTML = '<option value="">Select Project</option>' +
          this.state.projects.map(p => {
            const parsed = this.parseNameAndRate(p);
            return `<option value="${parsed.name}">${parsed.name}</option>`;
          }).join('');
        
        if (this.state.settings.defaultProject) {
          const defaultParsed = this.parseNameAndRate(this.state.settings.defaultProject);
          projectSelect.value = defaultParsed.name;
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
      let projectedRevenue = tasks.reduce((sum, task) => sum + this.calculateTaskRevenue(task), 0);
      
      // Add current task time and revenue if it's in the current period
      if (this.state.currentTask && this.isTaskInPeriod(this.state.currentTask.startTime, this.currentPeriod, now)) {
        const currentTime = Date.now();
        const startTime = new Date(this.state.currentTask.startTime);
        
        if (!isNaN(startTime.getTime())) {
          const sessionDuration = currentTime - startTime.getTime();
          const currentTaskTotalDuration = this.state.currentTask.duration + sessionDuration;
          
          totalTime += currentTaskTotalDuration;
          if (this.state.currentTask.billable) {
            billableTime += currentTaskTotalDuration;
            
            // Calculate revenue for current task including live session time
            const currentTaskWithLiveTime = {
              ...this.state.currentTask,
              duration: currentTaskTotalDuration
            };
            projectedRevenue += this.calculateTaskRevenue(currentTaskWithLiveTime);
          }
        }
      }
      
      const totalTimeEl = document.getElementById('totalTime');
      const billableTimeEl = document.getElementById('billableTime');
      const projectedRevenueEl = document.getElementById('projectedRevenue');
      
      if (totalTimeEl) totalTimeEl.textContent = this.formatDuration(totalTime);
      if (billableTimeEl) billableTimeEl.textContent = this.formatDuration(billableTime);
      if (projectedRevenueEl) projectedRevenueEl.textContent = projectedRevenue > 0 ? this.formatCurrency(projectedRevenue) : '—';
    } catch (error) {
      console.error('Error updating summary:', error);
    }
  }

  updateTaskList() {
    try {
      const taskList = document.getElementById('taskList');
      if (!taskList) return;
      
      // Sort tasks first to maintain consistent ordering
      this.sortedTasks = [...this.state.tasks].sort((a, b) => {
        const dateA = new Date(a.startTime || a.endTime);
        const dateB = new Date(b.startTime || b.endTime);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Reset displayed count when updating task list (e.g., after deleting tasks)
      this.tasksDisplayed = Math.min(10, this.sortedTasks.length);
      
      this.renderTaskList();
    } catch (error) {
      console.error('Error updating task list:', error);
    }
  }

  renderTaskList() {
    try {
      const taskList = document.getElementById('taskList');
      if (!taskList) return;
      
      if (this.state.tasks.length === 0) {
        taskList.innerHTML = '<div class="empty-state">No tasks yet. Start tracking your first task!</div>';
        return;
      }
      
      // Use pre-sorted tasks
      if (!this.sortedTasks) {
        this.sortedTasks = [...this.state.tasks].sort((a, b) => {
          const dateA = new Date(a.startTime || a.endTime);
          const dateB = new Date(b.startTime || b.endTime);
          return dateB.getTime() - dateA.getTime();
        });
      }
      
      const tasksToShow = this.sortedTasks.slice(0, this.tasksDisplayed);
      const hasMoreTasks = this.sortedTasks.length > this.tasksDisplayed;
      
      // Group tasks by date
      const groupedTasks = this.groupTasksByDate(tasksToShow);
      
      // Generate HTML for grouped tasks
      const tasksHTML = this.renderGroupedTasks(groupedTasks);
      
      const loadMoreHTML = hasMoreTasks ? `
        <div class="load-more-section">
          <button id="loadMoreBtn" class="btn btn-text">
            Load More Tasks (${this.sortedTasks.length - this.tasksDisplayed} remaining)
          </button>
        </div>
      ` : '';
      
      taskList.innerHTML = tasksHTML + loadMoreHTML;
    } catch (error) {
      console.error('Error rendering task list:', error);
    }
  }

  groupTasksByDate(tasks) {
    const groups = {};
    const today = new Date().toDateString();
    
    tasks.forEach(task => {
      const taskDate = new Date(task.startTime || task.endTime);
      const dateKey = taskDate.toDateString(); // "Mon Dec 18 2023"
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: taskDate,
          tasks: [],
          totalDuration: 0
        };
      }
      
      groups[dateKey].tasks.push(task);
      groups[dateKey].totalDuration += Number(task.duration) || 0;
    });
    
    // Add current task duration to today's total if applicable
    if (this.state.currentTask && groups[today]) {
      const currentTime = Date.now();
      const startTime = new Date(this.state.currentTask.startTime);
      
      if (!isNaN(startTime.getTime())) {
        const sessionDuration = currentTime - startTime.getTime();
        const currentTaskTotalDuration = this.state.currentTask.duration + sessionDuration;
        groups[today].totalDuration += currentTaskTotalDuration;
      }
    }
    
    // Sort groups by date (most recent first)
    return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  renderGroupedTasks(groupedTasks) {
    return groupedTasks.map(group => {
      const dateHeader = this.formatDateHeader(group.date, group.totalDuration);
      const tasksHTML = group.tasks.map(task => {
        const customerName = task.customer ? this.parseNameAndRate(task.customer).name : 'No Customer';
        const projectName = task.project ? this.parseNameAndRate(task.project).name : 'No Project';
        
        return `
        <div class="task-item" data-task-id="${task.id}">
          <div class="task-item-info">
            <div class="task-item-title">${task.title}</div>
            <div class="task-item-meta">
              ${customerName} • ${projectName}
              ${task.billable ? '<span class="billable-indicator">💰</span>' : ''}
            </div>
          </div>
          <div class="task-item-actions">
            <div class="task-item-duration">${this.formatDuration(Number(task.duration) || 0)}</div>
            <button class="task-play-btn" data-task-id="${task.id}" title="Restart task">
              <svg class="play-icon" viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg">
                <path d="M37.728,328.12c2.266,1.256,4.77,1.88,7.272,1.88c2.763,0,5.522-0.763,7.95-2.28l240-149.999c4.386-2.741,7.05-7.548,7.05-12.72c0-5.172-2.664-9.979-7.05-12.72L52.95,2.28c-4.625-2.891-10.453-3.043-15.222-0.4C32.959,4.524,30,9.547,30,15v300C30,320.453,32.959,325.476,37.728,328.12z"/>
              </svg>
            </button>
            <button class="task-delete-btn" data-task-id="${task.id}" title="Delete task">🗑️</button>
          </div>
        </div>`;
      }).join('');
      
      return `
        <div class="task-group">
          <div class="task-group-header">${dateHeader}</div>
          <div class="task-group-content">
            ${tasksHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  formatDateHeader(date, totalDuration) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    let dateText;
    if (date.toDateString() === today.toDateString()) {
      dateText = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateText = 'Yesterday';
    } else {
      // Format as "Monday, Dec 18, 2023"
      dateText = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    
    const formattedDuration = this.formatDuration(totalDuration || 0);
    return `
      <span class="date-text">${dateText}</span>
      <span class="daily-total">${formattedDuration}</span>
    `;
  }

  loadMoreTasks() {
    try {
      const totalTasks = this.sortedTasks ? this.sortedTasks.length : this.state.tasks.length;
      const remainingTasks = totalTasks - this.tasksDisplayed;
      const tasksToAdd = Math.min(10, remainingTasks);
      
      if (tasksToAdd > 0) {
        this.tasksDisplayed += tasksToAdd;
        this.renderTaskList();
      }
    } catch (error) {
      console.error('Error loading more tasks:', error);
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

  // Rate parsing utilities
  parseNameOnly(input) {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();
    const lastCommaIndex = trimmed.lastIndexOf(',');
    return lastCommaIndex === -1 ? trimmed : trimmed.substring(0, lastCommaIndex).trim();
  }

  deduplicateArray(array) {
    if (!Array.isArray(array)) return [];
    const seen = new Set();
    return array.filter(item => {
      const normalizedName = this.parseNameOnly(item);
      if (seen.has(normalizedName)) {
        return false;
      }
      seen.add(normalizedName);
      return true;
    });
  }

  findExistingEntry(array, newEntry) {
    if (!Array.isArray(array) || !newEntry) return null;
    const newName = this.parseNameOnly(newEntry);
    return array.find(item => this.parseNameOnly(item) === newName);
  }

  addUniqueEntry(array, newEntry) {
    if (!Array.isArray(array) || !newEntry) return array;
    const existing = this.findExistingEntry(array, newEntry);
    if (existing) {
      return array; // Entry already exists, don't add
    }
    return [...array, newEntry].sort();
  }

  parseNameAndRate(input) {
    const trimmed = input.trim();
    const lastCommaIndex = trimmed.lastIndexOf(',');
    
    if (lastCommaIndex === -1) {
      return { name: trimmed, rate: null };
    }
    
    const name = trimmed.substring(0, lastCommaIndex).trim();
    const rateStr = trimmed.substring(lastCommaIndex + 1).trim();
    const rate = parseFloat(rateStr);
    
    if (isNaN(rate) || rate < 0) {
      return { name: trimmed, rate: null };
    }
    
    return { name, rate };
  }

  // Get hourly rate for a task (project rate takes precedence over customer rate)
  getHourlyRate(customer, project) {
    // First check for project rate
    if (project) {
      // Check exact match first (for backwards compatibility)
      for (const projectStr of this.state.projects) {
        const parsed = this.parseNameAndRate(projectStr);
        if (parsed.name === project && parsed.rate !== null) {
          return parsed.rate;
        }
      }
      
      // Also check if the project name is actually the full string with rate
      for (const projectStr of this.state.projects) {
        if (projectStr === project) {
          const parsed = this.parseNameAndRate(projectStr);
          if (parsed.rate !== null) {
            return parsed.rate;
          }
        }
      }
    }
    
    // Then check for customer rate
    if (customer) {
      // Check exact match first (for backwards compatibility)
      for (const customerStr of this.state.customers) {
        const parsed = this.parseNameAndRate(customerStr);
        if (parsed.name === customer && parsed.rate !== null) {
          return parsed.rate;
        }
      }
      
      // Also check if the customer name is actually the full string with rate
      for (const customerStr of this.state.customers) {
        if (customerStr === customer) {
          const parsed = this.parseNameAndRate(customerStr);
          if (parsed.rate !== null) {
            return parsed.rate;
          }
        }
      }
    }
    
    return null;
  }

  // Calculate projected revenue for a task
  calculateTaskRevenue(task) {
    if (!task.billable) return 0;
    
    const rate = this.getHourlyRate(task.customer, task.project);
    if (rate === null) return 0;
    
    const durationHours = (Number(task.duration) || 0) / (1000 * 60 * 60);
    return rate * durationHours;
  }

  // Currency formatting utility
  formatCurrency(amount, currency = null, format = null) {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    
    const currencyCode = currency || this.state.settings.currency || 'EUR';
    const formatTemplate = format || this.state.settings.currencyFormat || '1,234.56 €';
    
    // Currency symbols mapping
    const symbols = {
      'EUR': '€',
      'USD': '$',
      'AFN': '؋',
      'ALL': 'L',
      'DZD': 'د.ج',
      'ARS': '$',
      'AMD': '֏',
      'AUD': 'A$',
      'AZN': '₼',
      'BHD': '.د.ب',
      'BDT': '৳',
      'BYN': 'Br',
      'BRL': 'R$',
      'GBP': '£',
      'BGN': 'лв',
      'CAD': 'C$',
      'CLP': '$',
      'CNY': '¥',
      'COP': '$',
      'HRK': 'kn',
      'CZK': 'Kč',
      'DKK': 'kr',
      'EGP': '£',
      'ETB': 'Br',
      'GEL': '₾',
      'GHS': '₵',
      'HKD': 'HK$',
      'HUF': 'Ft',
      'ISK': 'kr',
      'INR': '₹',
      'IDR': 'Rp',
      'IRR': '﷼',
      'IQD': 'ع.د',
      'ILS': '₪',
      'JPY': '¥',
      'JOD': 'د.ا',
      'KZT': '₸',
      'KES': 'Sh',
      'KWD': 'د.ك',
      'LBP': 'ل.ل',
      'MYR': 'RM',
      'MXN': '$',
      'MAD': 'د.م.',
      'NZD': 'NZ$',
      'NGN': '₦',
      'NOK': 'kr',
      'PKR': '₨',
      'PHP': '₱',
      'PLN': 'zł',
      'QAR': 'ر.ق',
      'RON': 'lei',
      'RUB': '₽',
      'SAR': 'ر.س',
      'RSD': 'дин',
      'SGD': 'S$',
      'ZAR': 'R',
      'KRW': '₩',
      'LKR': 'Rs',
      'SEK': 'kr',
      'CHF': 'Fr',
      'THB': '฿',
      'TRY': '₺',
      'UAH': '₴',
      'AED': 'د.إ',
      'UYU': '$',
      'VES': 'Bs',
      'VND': '₫'
    };
    
    const symbol = symbols[currencyCode] || currencyCode;
    
    // Format number based on template
    let formattedAmount;
    if (formatTemplate.includes('1.234,56')) {
      // Dot thousands, comma decimal (e.g., German/European format)
      formattedAmount = amount.toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (formatTemplate.includes('1 234,56')) {
      // Space thousands, comma decimal (e.g., French format)
      formattedAmount = amount.toLocaleString('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (formatTemplate.includes("1'234.56")) {
      // Apostrophe thousands, dot decimal (e.g., Swiss format)
      formattedAmount = amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).replace(/,/g, "'");
    } else if (formatTemplate.includes('1234.56')) {
      // No thousands separator
      formattedAmount = amount.toFixed(2);
    } else {
      // Default: comma thousands, dot decimal (e.g., US format)
      formattedAmount = amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    
    // Apply currency symbol/code placement
    if (formatTemplate.startsWith('€') || formatTemplate.startsWith(symbol)) {
      // Symbol before amount
      return `${symbol}${formattedAmount}`;
    } else if (formatTemplate.startsWith('EUR') || formatTemplate.startsWith(currencyCode + ' ')) {
      // Currency code before amount
      return `${currencyCode} ${formattedAmount}`;
    } else if (formatTemplate.endsWith(' EUR') || formatTemplate.endsWith(' ' + currencyCode)) {
      // Currency code after amount
      return `${formattedAmount} ${currencyCode}`;
    } else {
      // Default: symbol after amount
      return `${formattedAmount} ${symbol}`;
    }
  }

  openSettings() {
    try {
      chrome.runtime.openOptionsPage();
    } catch (error) {
      console.error('Error opening settings:', error);
    }
  }

  async exportTasks() {
    try {
      const response = await this.sendMessageWithRetry({ action: 'exportTasks' });
      
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
        
      } else {
        console.error('Popup: Failed to export tasks:', response);
        alert(response?.error || 'Failed to export tasks');
      }
    } catch (error) {
      console.error('Error exporting tasks:', error);
      alert('Failed to export tasks. Please try again.');
    }
  }

  handleKeyboard(e) {
    try {
      // Don't handle shortcuts when modal is open
      if (document.getElementById('editModal').style.display === 'flex') {
        if (e.key === 'Escape') {
          this.closeEditModal();
        }
        return;
      }
      
      // Handle Enter key to start task when task title input is focused
      if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        const taskTitleInput = document.getElementById('taskTitle');
        
        // Check if the task title input is focused (allow empty title)
        if (activeElement === taskTitleInput) {
          e.preventDefault();
          const startBtn = document.getElementById('startBtn');
          if (startBtn && !startBtn.disabled) {
            this.startTask();
          }
        }
        return;
      }
      
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
        }
      }
    } catch (error) {
      console.error('Error handling keyboard:', error);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    new TimeTracker();
  } catch (error) {
    console.error('Failed to initialize TimeTracker popup:', error);
  }
});

// Also try to initialize immediately if DOM is already loaded
if (document.readyState !== 'loading') {
  try {
    new TimeTracker();
  } catch (error) {
    console.error('Failed to initialize TimeTracker popup immediately:', error);
  }
}