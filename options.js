class SettingsManager {
  constructor() {
    this.settings = {
      defaultCustomer: '',
      defaultProject: '',
      defaultBillable: false,
      webhookUrl: '',
      webhookEnabled: false
    };
    this.customers = ['Default Client'];
    this.projects = ['General'];
    this.tasks = [];
    
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadData() {
    const data = await chrome.storage.local.get([
      'settings',
      'customers',
      'projects',
      'tasks'
    ]);
    
    this.settings = { ...this.settings, ...data.settings };
    this.customers = data.customers || ['Default Client'];
    this.projects = data.projects || ['General'];
    this.tasks = data.tasks || [];
  }

  async saveData() {
    // Send settings update to background script
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        data: {
          settings: this.settings,
          customers: this.customers,
          projects: this.projects
        }
      }, resolve);
    });
  }

  setupEventListeners() {
    // Save settings
    document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
    document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
    
    // Webhook settings
    document.getElementById('webhookEnabled').addEventListener('change', (e) => {
      const enabled = e.target.checked;
      document.getElementById('webhookUrl').disabled = !enabled;
      document.getElementById('testWebhook').disabled = !enabled;
    });
    
    document.getElementById('testWebhook').addEventListener('click', () => this.testWebhook());
    
    // Data management
    document.getElementById('exportAllData').addEventListener('click', () => this.exportAllData());
    document.getElementById('importData').addEventListener('change', (e) => this.importData(e));
    document.getElementById('clearAllData').addEventListener('click', () => this.clearAllData());
  }

  updateUI() {
    // Update form fields
    document.getElementById('webhookEnabled').checked = this.settings.webhookEnabled;
    document.getElementById('webhookUrl').value = this.settings.webhookUrl;
    document.getElementById('webhookUrl').disabled = !this.settings.webhookEnabled;
    document.getElementById('testWebhook').disabled = !this.settings.webhookEnabled;
    document.getElementById('defaultBillable').checked = this.settings.defaultBillable;
    
    // Update customers and projects text areas
    document.getElementById('customersInput').value = this.customers.join('\n');
    document.getElementById('projectsInput').value = this.projects.join('\n');
    
    // Update dropdown options
    this.updateDropdowns();
  }

  updateDropdowns() {
    const defaultCustomerSelect = document.getElementById('defaultCustomer');
    const defaultProjectSelect = document.getElementById('defaultProject');
    
    defaultCustomerSelect.innerHTML = '<option value="">Select default customer</option>' +
      this.customers.map(c => `<option value="${c}" ${c === this.settings.defaultCustomer ? 'selected' : ''}>${c}</option>`).join('');
    
    defaultProjectSelect.innerHTML = '<option value="">Select default project</option>' +
      this.projects.map(p => `<option value="${p}" ${p === this.settings.defaultProject ? 'selected' : ''}>${p}</option>`).join('');
  }

  async saveSettings() {
    try {
      // Update settings from form
      this.settings.webhookEnabled = document.getElementById('webhookEnabled').checked;
      this.settings.webhookUrl = document.getElementById('webhookUrl').value.trim();
      this.settings.defaultCustomer = document.getElementById('defaultCustomer').value;
      this.settings.defaultProject = document.getElementById('defaultProject').value;
      this.settings.defaultBillable = document.getElementById('defaultBillable').checked;
      
      // Update customers and projects from text areas
      const customersText = document.getElementById('customersInput').value.trim();
      const projectsText = document.getElementById('projectsInput').value.trim();
      
      this.customers = customersText ? customersText.split('\n').map(c => c.trim()).filter(c => c) : ['Default Client'];
      this.projects = projectsText ? projectsText.split('\n').map(p => p.trim()).filter(p => p) : ['General'];
      
      await this.saveData();
      this.updateDropdowns();
      this.showSaveStatus('Settings saved successfully!', 'success');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showSaveStatus('Error saving settings. Please try again.', 'error');
    }
  }

  async resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      this.settings = {
        defaultCustomer: '',
        defaultProject: '',
        defaultBillable: false,
        webhookUrl: '',
        webhookEnabled: false
      };
      this.customers = ['Default Client'];
      this.projects = ['General'];
      
      await this.saveData();
      this.updateUI();
      this.showSaveStatus('Settings reset to defaults.', 'success');
    }
  }

  async testWebhook() {
    const webhookUrl = document.getElementById('webhookUrl').value.trim();
    if (!webhookUrl) {
      this.showSaveStatus('Please enter a webhook URL first.', 'error');
      return;
    }

    try {
      const testData = {
        id: Date.now(),
        title: 'Test Task',
        customer: 'Test Customer',
        project: 'Test Project',
        billable: true,
        startTime: new Date(),
        endTime: new Date(),
        duration: 3600000 // 1 hour
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      if (response.ok) {
        this.showSaveStatus('Webhook test successful!', 'success');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Webhook test failed:', error);
      this.showSaveStatus(`Webhook test failed: ${error.message}`, 'error');
    }
  }

  async exportAllData() {
    try {
      // Get fresh data from storage
      const data = await chrome.storage.local.get(['tasks']);
      const tasks = data.tasks || [];
      
      if (tasks.length === 0) {
        this.showSaveStatus('No data to export.', 'error');
        return;
      }

      const csvContent = this.generateCSV(tasks);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `time-tracker-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showSaveStatus('Data exported successfully!', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showSaveStatus(`Export failed: ${error.message}`, 'error');
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
        `"${task.customer || ''}"`,
        `"${task.project || ''}"`,
        task.billable ? 'Y' : 'N',
        startTime.toISOString(),
        endTime ? endTime.toISOString() : '',
        Math.floor((Number(task.duration) || 0) / 1000)
      ];
    });
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim()); // Remove empty lines
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }
      
      const headers = this.parseCSVLine(lines[0]);
      
      // More detailed header validation
      const expectedHeaders = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)'];
      const alternativeHeaders = [
        'Billable (Y/N)', // Alternative format for Billable column
      ];
      
      // Check each expected header
      const missingHeaders = [];
      const foundHeaders = [];
      
      for (const expectedHeader of expectedHeaders) {
        let found = false;
        
        // Check exact match first
        if (headers.includes(expectedHeader)) {
          found = true;
          foundHeaders.push(expectedHeader);
        } else if (expectedHeader === 'Billable') {
          // Special case for Billable column - check alternatives
          if (headers.includes('Billable (Y/N)')) {
            found = true;
            foundHeaders.push('Billable (Y/N)');
          }
        }
        
        if (!found) {
          missingHeaders.push(expectedHeader);
        }
      }
      
      if (missingHeaders.length > 0) {
        const errorMessage = `Invalid CSV format. Missing headers: ${missingHeaders.join(', ')}\n\n` +
          `Found headers: ${headers.join(', ')}\n\n` +
          `Expected headers: ${expectedHeaders.join(', ')}\n\n` +
          `Note: "Billable" column can also be named "Billable (Y/N)"`;
        throw new Error(errorMessage);
      }
      
      // Find the index of the billable column (could be "Billable" or "Billable (Y/N)")
      const billableIndex = headers.indexOf('Billable') !== -1 ? 
        headers.indexOf('Billable') : 
        headers.indexOf('Billable (Y/N)');
      
      const importedTasks = [];
      const errors = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        try {
          const values = this.parseCSVLine(line);
          if (values.length !== headers.length) {
            errors.push(`Line ${i + 1}: Expected ${headers.length} columns, found ${values.length}`);
            continue;
          }
          
          // Map values to expected positions
          const titleIndex = headers.indexOf('Task Title');
          const customerIndex = headers.indexOf('Customer');
          const projectIndex = headers.indexOf('Project');
          const startTimeIndex = headers.indexOf('Start Time');
          const endTimeIndex = headers.indexOf('End Time');
          const durationIndex = headers.indexOf('Duration (seconds)');
          
          const title = values[titleIndex]?.replace(/^"|"$/g, '').trim();
          const customer = values[customerIndex]?.replace(/^"|"$/g, '').trim();
          const project = values[projectIndex]?.replace(/^"|"$/g, '').trim();
          const billableValue = values[billableIndex]?.replace(/^"|"$/g, '').trim().toUpperCase();
          const startTimeStr = values[startTimeIndex]?.replace(/^"|"$/g, '').trim();
          const endTimeStr = values[endTimeIndex]?.replace(/^"|"$/g, '').trim();
          const durationStr = values[durationIndex]?.replace(/^"|"$/g, '').trim();
          
          if (!title) {
            errors.push(`Line ${i + 1}: Task title is required`);
            continue;
          }
          
          // Parse start time with better error handling
          let startTime = null;
          if (startTimeStr) {
            startTime = this.parseDateTime(startTimeStr);
            if (!startTime) {
              errors.push(`Line ${i + 1}: Invalid start time "${startTimeStr}". Expected ISO format like "2023-01-01T10:00:00.000Z"`);
              continue;
            }
          } else {
            errors.push(`Line ${i + 1}: Start time is required`);
            continue;
          }
          
          // Parse end time with better error handling
          let endTime = null;
          if (endTimeStr) {
            endTime = this.parseDateTime(endTimeStr);
            if (!endTime) {
              errors.push(`Line ${i + 1}: Invalid end time "${endTimeStr}". Expected ISO format like "2023-01-01T11:00:00.000Z"`);
              continue;
            }
          }
          
          // Parse duration
          const duration = parseInt(durationStr) * 1000; // Convert seconds to milliseconds
          if (isNaN(duration) || duration < 0) {
            errors.push(`Line ${i + 1}: Invalid duration "${durationStr}". Expected positive number in seconds`);
            continue;
          }
          
          // Validate that end time is after start time if both are provided
          if (endTime && startTime && endTime <= startTime) {
            errors.push(`Line ${i + 1}: End time must be after start time`);
            continue;
          }
          
          const task = {
            id: Date.now() + Math.random() * 1000 + i, // Ensure unique IDs
            title,
            customer: customer || '',
            project: project || '',
            billable: billableValue === 'Y' || billableValue === 'YES' || billableValue === 'TRUE',
            startTime,
            endTime,
            duration
          };
          
          importedTasks.push(task);
          
        } catch (lineError) {
          errors.push(`Line ${i + 1}: ${lineError.message}`);
        }
      }
      
      if (errors.length > 0 && importedTasks.length === 0) {
        throw new Error(`No valid tasks found. Errors:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''}`);
      }
      
      if (importedTasks.length === 0) {
        throw new Error('No valid tasks found in the CSV file.');
      }
      
      // Get current tasks and merge
      const currentData = await chrome.storage.local.get(['tasks']);
      const currentTasks = currentData.tasks || [];
      
      // Convert Date objects to ISO strings for storage
      const tasksForStorage = importedTasks.map(task => ({
        ...task,
        startTime: task.startTime instanceof Date ? task.startTime.toISOString() : task.startTime,
        endTime: task.endTime instanceof Date ? task.endTime.toISOString() : task.endTime
      }));
      
      const allTasks = [...tasksForStorage, ...currentTasks];
      
      // Save directly to storage
      await chrome.storage.local.set({ tasks: allTasks });
      
      // Notify background script to reload data
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for background response'));
          }, 5000);
          
          chrome.runtime.sendMessage({ action: 'reloadData' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.success) {
              resolve(response);
            } else {
              reject(new Error(response?.error || 'Failed to reload data in background'));
            }
          });
        });
      } catch (reloadError) {
        console.warn('Failed to notify background script:', reloadError);
        // Continue anyway - the storage change listener should pick it up
      }
      
      let statusMessage = `Successfully imported ${importedTasks.length} tasks.`;
      if (errors.length > 0) {
        statusMessage += ` ${errors.length} rows had errors and were skipped.`;
      }
      
      this.showSaveStatus(statusMessage, 'success');
      
      // Show errors if any (but still consider import successful if we got some tasks)
      if (errors.length > 0) {
        console.warn('Import errors:', errors);
        setTimeout(() => {
          this.showSaveStatus(`Import completed with ${errors.length} errors. Check console for details.`, 'error');
        }, 3000);
      }
      
    } catch (error) {
      console.error('Import failed:', error);
      this.showSaveStatus(`Import failed: ${error.message}`, 'error');
    }
    
    // Reset file input
    event.target.value = '';
  }

  // Enhanced date parsing function
  parseDateTime(dateStr) {
    if (!dateStr) return null;
    
    try {
      // Try parsing as ISO string first
      const date = new Date(dateStr);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateStr);
        return null;
      }
      
      // Additional validation - check if it's a reasonable date (not too far in past/future)
      const now = new Date();
      const minDate = new Date('2000-01-01');
      const maxDate = new Date(now.getFullYear() + 10, 11, 31); // 10 years in future
      
      if (date < minDate || date > maxDate) {
        console.warn('Date out of reasonable range:', dateStr, date);
        return null;
      }
      
      return date;
    } catch (error) {
      console.warn('Error parsing date:', dateStr, error);
      return null;
    }
  }

  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  async clearAllData() {
    if (confirm('Are you sure you want to delete ALL time tracking data? This cannot be undone.')) {
      if (confirm('This will permanently delete all your tasks, customers, projects, and settings. Are you absolutely sure?')) {
        try {
          await chrome.storage.local.clear();
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
          
          this.updateUI();
          this.showSaveStatus('All data has been cleared.', 'success');
        } catch (error) {
          console.error('Error clearing data:', error);
          this.showSaveStatus('Error clearing data. Please try again.', 'error');
        }
      }
    }
  }

  showSaveStatus(message, type) {
    const statusEl = document.getElementById('saveStatus');
    statusEl.textContent = message;
    statusEl.className = `save-status ${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 5000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});