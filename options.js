class SettingsManager {
  constructor() {
    this.settings = {
      defaultCustomer: '',
      defaultProject: '',
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
    await chrome.storage.local.set({
      settings: this.settings,
      customers: this.customers,
      projects: this.projects
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

  exportAllData() {
    if (this.tasks.length === 0) {
      this.showSaveStatus('No data to export.', 'error');
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
    
    this.showSaveStatus('Data exported successfully!', 'success');
  }

  generateCSV(tasks) {
    const headers = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)'];
    const rows = tasks.map(task => [
      `"${task.title.replace(/"/g, '""')}"`,
      `"${task.customer}"`,
      `"${task.project}"`,
      task.billable ? 'Y' : 'N',
      new Date(task.startTime).toISOString(),
      task.endTime ? new Date(task.endTime).toISOString() : '',
      Math.floor(task.duration / 1000)
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',');
      
      // Validate CSV format
      const expectedHeaders = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)'];
      if (!expectedHeaders.every(header => headers.includes(header))) {
        throw new Error('Invalid CSV format. Please check the headers.');
      }
      
      const importedTasks = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = this.parseCSVLine(line);
        if (values.length !== headers.length) continue;
        
        const task = {
          id: Date.now() + i,
          title: values[0].replace(/"/g, ''),
          customer: values[1].replace(/"/g, ''),
          project: values[2].replace(/"/g, ''),
          billable: values[3] === 'Y',
          startTime: new Date(values[4]),
          endTime: values[5] ? new Date(values[5]) : null,
          duration: parseInt(values[6]) * 1000
        };
        
        importedTasks.push(task);
      }
      
      if (importedTasks.length === 0) {
        throw new Error('No valid tasks found in the CSV file.');
      }
      
      // Merge with existing tasks
      this.tasks = [...importedTasks, ...this.tasks];
      await chrome.storage.local.set({ tasks: this.tasks });
      
      this.showSaveStatus(`Successfully imported ${importedTasks.length} tasks.`, 'success');
      
    } catch (error) {
      console.error('Import failed:', error);
      this.showSaveStatus(`Import failed: ${error.message}`, 'error');
    }
    
    // Reset file input
    event.target.value = '';
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