class SettingsManager {
  constructor() {
    this.settings = {
      defaultCustomer: '',
      defaultProject: '',
      defaultBillable: false,
      webhookUrl: '',
      webhookEnabled: false,
      currency: 'EUR',
      currencyFormat: '1,234.56 €'
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
    document.getElementById('importData').addEventListener('change', (e) => this.handleFileSelection(e));
    document.getElementById('importBtn').addEventListener('click', () => this.importData());
    document.getElementById('clearAllData').addEventListener('click', () => this.clearAllData());
    
    // Name migration tools
    document.getElementById('previewNameUpdate').addEventListener('click', () => this.previewNameUpdate());
    document.getElementById('applyNameUpdate').addEventListener('click', () => this.applyNameUpdate());
    
    // Help box functionality
    document.getElementById('importHelpIcon').addEventListener('click', () => this.showImportHelp());
    document.getElementById('helpCloseBtn').addEventListener('click', () => this.hideImportHelp());
    document.getElementById('helpOverlay').addEventListener('click', () => this.hideImportHelp());
    
    // Close help box with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('importHelpBox').classList.contains('show')) {
        this.hideImportHelp();
      }
    });
  }

  updateUI() {
    // Update form fields
    document.getElementById('webhookEnabled').checked = this.settings.webhookEnabled;
    document.getElementById('webhookUrl').value = this.settings.webhookUrl;
    document.getElementById('webhookUrl').disabled = !this.settings.webhookEnabled;
    document.getElementById('testWebhook').disabled = !this.settings.webhookEnabled;
    document.getElementById('defaultBillable').checked = this.settings.defaultBillable;
    
    // Update currency settings
    document.getElementById('currency').value = this.settings.currency;
    document.getElementById('currencyFormat').value = this.settings.currencyFormat;
    
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
      this.customers.map(c => {
        const parsed = this.parseNameAndRate(c);
        const isSelected = parsed.name === this.parseNameAndRate(this.settings.defaultCustomer || '').name;
        return `<option value="${parsed.name}" ${isSelected ? 'selected' : ''}>${parsed.name}</option>`;
      }).join('');
    
    defaultProjectSelect.innerHTML = '<option value="">Select default project</option>' +
      this.projects.map(p => {
        const parsed = this.parseNameAndRate(p);
        const isSelected = parsed.name === this.parseNameAndRate(this.settings.defaultProject || '').name;
        return `<option value="${parsed.name}" ${isSelected ? 'selected' : ''}>${parsed.name}</option>`;
      }).join('');
  }

  async saveSettings() {
    try {
      // Update settings from form
      this.settings.webhookEnabled = document.getElementById('webhookEnabled').checked;
      this.settings.webhookUrl = document.getElementById('webhookUrl').value.trim();
      this.settings.defaultCustomer = document.getElementById('defaultCustomer').value;
      this.settings.defaultProject = document.getElementById('defaultProject').value;
      this.settings.defaultBillable = document.getElementById('defaultBillable').checked;
      this.settings.currency = document.getElementById('currency').value;
      this.settings.currencyFormat = document.getElementById('currencyFormat').value;
      
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
        webhookEnabled: false,
        currency: 'EUR',
        currencyFormat: '1,234.56 €'
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
    const headers = ['Task Title', 'Customer', 'Project', 'Billable', 'Start Time', 'End Time', 'Duration (seconds)', 'Projected Revenue'];
    const rows = tasks.map(task => {
      // Ensure we have valid dates
      const startTime = task.startTime instanceof Date ? task.startTime : new Date(task.startTime);
      const endTime = task.endTime ? (task.endTime instanceof Date ? task.endTime : new Date(task.endTime)) : null;
      
      // Calculate projected revenue for this task
      const revenue = this.calculateTaskRevenue(task);
      const formattedRevenue = revenue > 0 ? this.formatCurrency(revenue) : '';
      
      return [
        `"${task.title.replace(/"/g, '""')}"`,
        `"${task.customer || ''}"`,
        `"${task.project || ''}"`,
        task.billable ? 'Y' : 'N',
        startTime.toISOString(),
        endTime ? endTime.toISOString() : '',
        Math.floor((Number(task.duration) || 0) / 1000),
        `"${formattedRevenue}"`
      ];
    });
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  handleFileSelection(event) {
    const file = event.target.files[0];
    const importBtn = document.getElementById('importBtn');
    
    if (file) {
      importBtn.disabled = false;
      importBtn.textContent = `Import ${file.name}`;
    } else {
      importBtn.disabled = true;
      importBtn.textContent = 'Import Tasks';
    }
  }

  async importData() {
    const fileInput = document.getElementById('importData');
    const file = fileInput.files[0];
    
    if (!file) {
      this.showSaveStatus('Please select a CSV file first.', 'error');
      return;
    }

    // Get selected import mode
    const importMode = document.querySelector('input[name="importMode"]:checked').value;

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
          const durationSeconds = parseInt(durationStr);
          if (isNaN(durationSeconds) || durationSeconds < 0) {
            errors.push(`Line ${i + 1}: Invalid duration "${durationStr}". Expected positive number in seconds`);
            continue;
          }
          
          // Convert seconds to milliseconds
          const duration = durationSeconds * 1000;
          
          // Warning for very short durations (less than 1 second)
          if (durationSeconds === 0) {
            errors.push(`Line ${i + 1}: Duration is 0 seconds. This may indicate a data issue.`);
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
      
      // Get current tasks and handle based on import mode
      const currentData = await chrome.storage.local.get(['tasks']);
      const currentTasks = currentData.tasks || [];
      
      // Convert Date objects to ISO strings for storage
      const tasksForStorage = importedTasks.map(task => ({
        ...task,
        startTime: task.startTime instanceof Date ? task.startTime.toISOString() : task.startTime,
        endTime: task.endTime instanceof Date ? task.endTime.toISOString() : task.endTime
      }));
      
      let finalTasks;
      let updatedCount = 0;
      let addedCount = 0;
      
      if (importMode === 'replace') {
        // Replace mode: use only imported tasks
        finalTasks = tasksForStorage;
        addedCount = tasksForStorage.length;
      } else if (importMode === 'update') {
        // Update mode: merge with duplicate detection
        const result = this.mergeTasksWithDuplicateDetection(currentTasks, tasksForStorage);
        finalTasks = result.tasks;
        updatedCount = result.updatedCount;
        addedCount = result.addedCount;
      } else {
        // Append mode: add all imported tasks (original behavior)
        finalTasks = [...tasksForStorage, ...currentTasks];
        addedCount = tasksForStorage.length;
      }
      
      // Save directly to storage
      await chrome.storage.local.set({ tasks: finalTasks });
      
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
      
      let statusMessage;
      if (importMode === 'replace') {
        statusMessage = `Successfully replaced all tasks with ${addedCount} imported tasks.`;
      } else if (importMode === 'update') {
        statusMessage = `Successfully processed ${importedTasks.length} tasks: ${updatedCount} updated, ${addedCount} added.`;
      } else {
        statusMessage = `Successfully imported ${addedCount} tasks.`;
      }
      
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
    
    // Reset file input and button
    const importBtn = document.getElementById('importBtn');
    fileInput.value = '';
    importBtn.disabled = true;
    importBtn.textContent = 'Import Tasks';
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
    
    // Scroll to make status message visible
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 5000);
  }

  // Utility functions for rate parsing
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
      for (const projectStr of this.projects) {
        const parsed = this.parseNameAndRate(projectStr);
        if (parsed.name === project && parsed.rate !== null) {
          return parsed.rate;
        }
      }
      
      // Also check if the project name is actually the full string with rate
      for (const projectStr of this.projects) {
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
      for (const customerStr of this.customers) {
        const parsed = this.parseNameAndRate(customerStr);
        if (parsed.name === customer && parsed.rate !== null) {
          return parsed.rate;
        }
      }
      
      // Also check if the customer name is actually the full string with rate
      for (const customerStr of this.customers) {
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

  formatCurrency(amount, currency = null, format = null) {
    if (amount === null || amount === undefined || isNaN(amount)) return '';
    
    const currencyCode = currency || this.settings.currency || 'EUR';
    const formatTemplate = format || this.settings.currencyFormat || '1,234.56 €';
    
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
      'RSD': 'دين',
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

  // Merge tasks with duplicate detection for update mode
  mergeTasksWithDuplicateDetection(currentTasks, importedTasks) {
    let updatedCount = 0;
    let addedCount = 0;
    const resultTasks = [...currentTasks];
    
    for (const importedTask of importedTasks) {
      // Find potential duplicate based on title, customer, project, and start time
      const duplicateIndex = resultTasks.findIndex(existingTask => {
        return existingTask.title === importedTask.title &&
               existingTask.customer === importedTask.customer &&
               existingTask.project === importedTask.project &&
               this.isSameDateTime(existingTask.startTime, importedTask.startTime);
      });
      
      if (duplicateIndex !== -1) {
        // Update existing task
        resultTasks[duplicateIndex] = { ...importedTask, id: resultTasks[duplicateIndex].id };
        updatedCount++;
      } else {
        // Add new task
        resultTasks.push(importedTask);
        addedCount++;
      }
    }
    
    return { tasks: resultTasks, updatedCount, addedCount };
  }

  // Check if two datetime strings represent the same time (within 1 minute tolerance)
  isSameDateTime(date1, date2) {
    const time1 = new Date(date1).getTime();
    const time2 = new Date(date2).getTime();
    const timeDiff = Math.abs(time1 - time2);
    return timeDiff < 60000; // 1 minute tolerance
  }

  // Preview name update changes
  async previewNameUpdate() {
    try {
      const oldName = document.getElementById('oldName').value.trim();
      const newName = document.getElementById('newName').value.trim();
      const updateType = document.querySelector('input[name="updateType"]:checked').value;
      
      if (!oldName || !newName) {
        this.showSaveStatus('Please enter both current and new names.', 'error');
        return;
      }
      
      // Get current tasks
      const data = await chrome.storage.local.get(['tasks']);
      const tasks = data.tasks || [];
      
      // Find matching tasks
      const matchingTasks = tasks.filter(task => {
        const targetField = updateType === 'customer' ? task.customer : task.project;
        return targetField === oldName;
      });
      
      // Display preview
      const previewDiv = document.getElementById('nameUpdatePreview');
      const resultsDiv = document.getElementById('nameUpdateResults');
      
      if (matchingTasks.length === 0) {
        resultsDiv.innerHTML = `<p>No tasks found with ${updateType} name "${oldName}".</p>`;
        document.getElementById('applyNameUpdate').disabled = true;
      } else {
        resultsDiv.innerHTML = `
          <p><strong>Found ${matchingTasks.length} tasks that will be updated:</strong></p>
          <ul style="max-height: 200px; overflow-y: auto;">
            ${matchingTasks.map(task => `
              <li>${task.title} - ${new Date(task.startTime).toLocaleDateString()}</li>
            `).join('')}
          </ul>
          <p><strong>Change:</strong> "${oldName}" → "${newName}"</p>
        `;
        document.getElementById('applyNameUpdate').disabled = false;
      }
      
      previewDiv.style.display = 'block';
    } catch (error) {
      console.error('Error previewing name update:', error);
      this.showSaveStatus('Error previewing changes. Please try again.', 'error');
    }
  }

  // Apply name update changes
  async applyNameUpdate() {
    try {
      const oldName = document.getElementById('oldName').value.trim();
      const newName = document.getElementById('newName').value.trim();
      const updateType = document.querySelector('input[name="updateType"]:checked').value;
      
      if (!oldName || !newName) {
        this.showSaveStatus('Please enter both current and new names.', 'error');
        return;
      }
      
      // Get current tasks
      const data = await chrome.storage.local.get(['tasks']);
      const tasks = data.tasks || [];
      
      // Update matching tasks
      let updatedCount = 0;
      const updatedTasks = tasks.map(task => {
        const targetField = updateType === 'customer' ? task.customer : task.project;
        if (targetField === oldName) {
          updatedCount++;
          return {
            ...task,
            [updateType]: newName
          };
        }
        return task;
      });
      
      // Save updated tasks
      await chrome.storage.local.set({ tasks: updatedTasks });
      
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
      }
      
      // Clear form and hide preview
      document.getElementById('oldName').value = '';
      document.getElementById('newName').value = '';
      document.getElementById('nameUpdatePreview').style.display = 'none';
      document.getElementById('applyNameUpdate').disabled = true;
      
      this.showSaveStatus(`Successfully updated ${updatedCount} tasks.`, 'success');
      
    } catch (error) {
      console.error('Error applying name update:', error);
      this.showSaveStatus('Error applying changes. Please try again.', 'error');
    }
  }

  // Help box functionality
  showImportHelp() {
    const helpBox = document.getElementById('importHelpBox');
    const helpOverlay = document.getElementById('helpOverlay');
    
    helpOverlay.classList.add('show');
    helpBox.classList.add('show');
    
    // Prevent body scroll when help box is open
    document.body.style.overflow = 'hidden';
  }

  hideImportHelp() {
    const helpBox = document.getElementById('importHelpBox');
    const helpOverlay = document.getElementById('helpOverlay');
    
    helpOverlay.classList.remove('show');
    helpBox.classList.remove('show');
    
    // Restore body scroll
    document.body.style.overflow = '';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});