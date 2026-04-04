'use strict';

const Homey = require('homey');

module.exports = class SPCPanelDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('SPC Panel Device has been initialized');

    // Get settings
    const settings = this.getSettings();
    this.log('Device settings:', {
      host: settings.host,
      https: settings.https,
      username: settings.username,
      poll_interval: settings.poll_interval,
    });

    // Initialize the API connection
    this.api = null;
    await this.initializeAPI();

    // Start polling
    this.startPolling();

    // Register capability listeners
    this.registerCapabilityListener('homealarm_state', this.onCapabilityHomealarmState.bind(this));
  }

  /**
   * Initialize the API connection
   */
  async initializeAPI() {
    const settings = this.getSettings();
    
    // Initialize the SPC API client
    this.api = this.homey.app.createSPCApi({
      host: settings.host,
      https: settings.https || false,
      username: settings.username,
      password: settings.password,
      debug: true,
    });

    this.log('API initialized');
    
    // Test the connection
    try {
      await this.api.testConnection();
      await this.setAvailable();
    } catch (error) {
      this.error('API connection test failed:', error);
      await this.setUnavailable(this.homey.__('errors.connection_failed'));
    }
  }

  /**
   * Start polling the panel status
   */
  startPolling() {
    const settings = this.getSettings();
    const interval = (settings.poll_interval || 5) * 1000;

    // Clear existing interval if any
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }

    // Start new polling interval
    this.pollInterval = this.homey.setInterval(async () => {
      await this.updateStatus();
    }, interval);

    // Initial status update
    this.updateStatus();
  }

  /**
   * Update the device status from the panel
   */
  async updateStatus() {
    try {
      if (!this.api) {
        this.log('API not initialized yet');
        return;
      }

      // Get status from the SPC panel
      const status = await this.api.getStatus();
      
      // Update capabilities
      await this.setCapabilityValue('homealarm_state', status.state);
      await this.setCapabilityValue('alarm_generic', status.alarm);
      
      // Mark device as available
      if (!this.getAvailable()) {
        await this.setAvailable();
      }
      
      this.log('Status updated:', status);
    } catch (error) {
      this.error('Failed to update status:', error);
      // Only mark unavailable on connection errors, not on parsing errors
      if (error.message.includes('Connection') || error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
        await this.setUnavailable(this.homey.__('errors.connection_lost'));
      }
    }
  }

  /**
   * Handle homealarm_state capability changes (arm/disarm)
   */
  async onCapabilityHomealarmState(value) {
    this.log('Setting alarm state to:', value);

    try {
      // Set alarm state on the SPC panel
      await this.api.setAlarmState(value);
      
      this.log('Alarm state changed to:', value);
      
      // Wait a moment for the panel to process the change
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update status after the change
      await this.updateStatus();
      
      return value;
    } catch (error) {
      this.error('Failed to change alarm state:', error);
      throw new Error(this.homey.__('errors.state_change_failed'));
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings were changed:', changedKeys);

    // Check if connection settings changed
    const connectionChanged = changedKeys.some(key => 
      ['host', 'https', 'username', 'password'].includes(key)
    );

    if (connectionChanged) {
      this.log('Connection settings changed, reinitializing API');
      await this.initializeAPI();
    }

    // Check if poll interval changed
    if (changedKeys.includes('poll_interval')) {
      this.log('Poll interval changed, restarting polling');
      this.startPolling();
    }
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('SPC Panel Device has been deleted');

    // Clear polling interval
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }

    // Close API connection
    if (this.api) {
      await this.api.disconnect();
    }
  }

};
