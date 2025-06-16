class TimeTracker {
  constructor() {
    // UI-only state - no persistent data stored here
    this.currentPeriod = 'today';
    this.editingTask = null;
    this.lastEditedField = null; // Track which field was last edited
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
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`Popup: Requesting initial state from background (attempt ${retryCount + 1}/${maxRetries})...`);
        
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for background response'));
          }, 5000); // 5 second timeout
          
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
          console.log('Popup: Received initial state:', this.state);
          return; // Success, exit retry loop
        } else {
          throw new Error(response?.error || 'Invalid response from background');
        }
      } catch (error) {
        console.error(`Popup: Error loading initial state (attempt ${retryCount + 1}):`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          // Wait before retrying, with exponential backoff
          const delay = Math.pow(2, retryCount) * 500; // 1s, 2s, 4s
          console.log(`Popup: Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Popup: Failed to load initial state after all retries');
          // Continue with default state
        }
      }
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
      
      console.log('Event listeners set up successfully');
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
        
        // Add keyboard navigation for duration field
        editDuration.addEventListener('keydown', (e) => this.handleDurationKeyboard(e));
        
        console.log('Edit modal time listeners set up successfully');
      }
    } catch (error) {
      console.error('Error setting up edit modal time listeners:', error);
    }
  }

  handleDurationKeyboard(e) {
    try {
      const input = e.target;
      const value = input.value;
      const cursorPos = input.selectionStart;
      
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        
        // Parse current duration
        const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
        if (!match) return;
        
        let hours = parseInt(match[1], 10);
        let minutes = parseInt(match[2], 10);
        let seconds = parseInt(match[3], 10);
        
        const increment = e.key === 'ArrowUp' ? 1 : -1;
        
        // Determine which part to modify based on cursor position
        // Format: HH:MM:SS (positions 0-1: hours, 3-4: minutes, 6-7: seconds)
        if (cursorPos <= 2) {
          // Hours section (positions 0-2, including the colon)
          hours = Math.max(0, Math.min(23, hours + increment));
        } else if (cursorPos <= 5) {
          // Minutes section (positions 3-5, including the colon)
          minutes += increment;
          if (minutes >= 60) {
            minutes = 0;
            hours = Math.min(23, hours + 1);
          } else if (minutes < 0) {
            minutes = 59;
            hours = Math.max(0, hours - 1);
          }
        } else {
          // Seconds section (positions 6-7)
          seconds += increment;
          if (seconds >= 60) {
            seconds = 0;
            minutes += 1;
            if (minutes >= 60) {
              minutes = 0;
              hours = Math.min(23, hours + 1);
            }
          } else if (seconds < 0) {
            seconds = 59;
            minutes -= 1;
            if (minutes < 0) {
              minutes = 59;
              hours = Math.max(0, hours - 1);
            }
          }
        }
        
        // Enforce 23:59:59 maximum
        if (hours >= 23) {
          hours = 23;
          if (minutes >= 59) {
            minutes = 59;
            if (seconds >= 59) {
              seconds = 59;
            }
          }
        }
        
        // Update the input value
        const newValue = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        input.value = newValue;
        
        // Restore cursor position
        setTimeout(() => {
          input.setSelectionRange(cursorPos, cursorPos);
        }, 0);
        
        // Mark as duration edited and trigger the time change handler
        this.lastEditedField = 'duration';
        this.handleEditTimeChange();
      }
    } catch (error) {
      console.error('Error handling duration keyboard:', error);
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
      if (this.lastEditedField === 'start' || this.lastEditedField === 'duration') {
        // Start time or duration changed - calculate end time
        if (startTime && !isNaN(startTime.getTime()) && duration !== null && duration >= 0) {
          const calculatedEndTime = new Date(startTime.getTime() + duration);
          editEndTime.value = this.formatDateTimeLocal(calculatedEndTime);
        } else if (!startTimeStr || !durationStr) {
          editEndTime.value = '';
        }
      } else if (this.lastEditedField === 'end') {
        // End time changed - calculate duration if we have start time
        if (startTime && endTime && !isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          const calculatedDuration = endTime.getTime() - startTime.getTime();
          if (calculatedDuration >= 0) {
            // Enforce 23:59:59 maximum (86340000 ms)
            const maxDuration = 23 * 3600 * 1000 + 59 * 60 * 1000 + 59 * 1000;
            const finalDuration = Math.min(calculatedDuration, maxDuration);
            editDuration.value = this.formatDurationForInput(finalDuration);
            
            // If we capped the duration, update the end time to reflect the cap
            if (finalDuration < calculatedDuration) {
              const cappedEndTime = new Date(startTime.getTime() + finalDuration);
              editEndTime.value = this.formatDateTimeLocal(cappedEndTime);
            }
          } else {
            // Negative duration - clear duration field
            editDuration.value = '00:00:00';
          }
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

  async sendMessageWithRetry(message, maxRetries = 2) {
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for response'));
          }, 3000);
          
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
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
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
      
      const title = titleInput.value.trim();
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
      
      if (!title) return;
      
      console.log('Popup: Starting task with data:', { title, customer, project, billable });
      
      const response = await this.sendMessageWithRetry({
        action: 'startTask',
        data: { title, customer, project, billable }
      });
      
      if (response && response.success) {
        console.log('Popup: Task started successfully');
        
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
        console.log('Popup: Task paused successfully');
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
        console.log('Popup: Task stopped successfully');
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
        console.log('Popup: Task resumed successfully');
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
        console.log('Popup: Paused task stopped successfully');
      } else {
        console.error('Popup: Failed to stop paused task:', response);
        alert('Failed to stop paused task. Please try again.');
      }
    } catch (error) {
      console.error('Error stopping paused task:', error);
      alert('Failed to stop paused task. Please try again.');
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
        customerDatalist.innerHTML = this.state.customers.map(c => `<option value="${c}">`).join('');
      }
      
      if (projectDatalist) {
        projectDatalist.innerHTML = this.state.projects.map(p => `<option value="${p}">`).join('');
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
        
        // Enforce 23:59:59 maximum (86340000 ms)
        const maxDuration = 23 * 3600 * 1000 + 59 * 60 * 1000 + 59 * 1000;
        if (duration > maxDuration) {
          alert('Maximum duration is 23:59:59');
          return;
        }
      }
      
      // Check if customer or project are new and need to be added
      let updatedCustomers = [...this.state.customers];
      let updatedProjects = [...this.state.projects];
      let needsSettingsUpdate = false;
      
      if (customer && !this.state.customers.includes(customer)) {
        updatedCustomers.push(customer);
        updatedCustomers.sort();
        needsSettingsUpdate = true;
      }
      
      if (project && !this.state.projects.includes(project)) {
        updatedProjects.push(project);
        updatedProjects.sort();
        needsSettingsUpdate = true;
      }
      
      // For current tasks, we need to handle the timing differently
      let taskData = {
        ...this.editingTask,
        title,
        customer,
        project,
        billable,
        startTime: startTime || this.editingTask.startTime,
        endTime: endTime,
        duration
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
        console.log('Popup: Task updated successfully');
        
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
        console.log('Popup: Task deleted successfully');
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
        console.log('Popup: Task deleted successfully');
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
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  formatDurationForInput(ms) {
    if (!ms || isNaN(ms) || ms < 0) {
      return '00:00:00';
    }
    
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  parseDurationInput(durationStr) {
    const match = durationStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    
    // Validate ranges
    if (hours > 23 || minutes >= 60 || seconds >= 60) return null;
    
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  updateUI() {
    try {
      console.log('Updating UI...');
      this.updateTaskStates();
      this.updateCustomerProjectDropdowns();
      this.updateSummary();
      this.updateTaskList();
      this.applyDefaultBillable();
      console.log('UI updated successfully');
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
        if (customerEl) customerEl.textContent = this.state.currentTask.customer || 'No Customer';
        if (projectEl) projectEl.textContent = this.state.currentTask.project || 'No Project';
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
        if (customerEl) customerEl.textContent = this.state.pausedTask.customer || 'No Customer';
        if (projectEl) projectEl.textContent = this.state.pausedTask.project || 'No Project';
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
        
        if (!isNaN(startTime.getTime())) {
          const sessionDuration = currentTime - startTime.getTime();
          const currentTaskTotalDuration = this.state.currentTask.duration + sessionDuration;
          
          totalTime += currentTaskTotalDuration;
          if (this.state.currentTask.billable) {
            billableTime += currentTaskTotalDuration;
          }
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
              ${task.customer || 'No Customer'} • ${task.project || 'No Project'}
              ${task.billable ? '<span class="billable-indicator">💰</span>' : ''}
            </div>
          </div>
          <div class="task-item-actions">
            <div class="task-item-duration">${this.formatDuration(Number(task.duration) || 0)}</div>
            <button class="task-delete-btn" data-task-id="${task.id}" title="Delete task">🗑️</button>
          </div>
        </div>
      `).join('');
      
      // Add click handlers for editing tasks
      taskList.querySelectorAll('.task-item').forEach(item => {
        const taskInfo = item.querySelector('.task-item-info');
        if (taskInfo) {
          taskInfo.addEventListener('click', () => {
            const taskId = parseInt(item.dataset.taskId);
            this.editTask(taskId);
          });
        }
      });
      
      // Add click handlers for delete buttons
      taskList.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent triggering the edit handler
          const taskId = parseInt(btn.dataset.taskId);
          this.deleteTaskDirectly(taskId);
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
        
        console.log('Popup: Tasks exported successfully');
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