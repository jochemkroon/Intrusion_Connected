'use strict';

const Homey = require('homey');

module.exports = class SPCPanelDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('SPC Panel Device has been initialized');

    // Add alarm_message capability if it doesn't exist (for existing devices)
    if (!this.hasCapability('alarm_message')) {
      this.log('Adding alarm_message capability to existing device');
      await this.addCapability('alarm_message');
    }

    // Get settings
    const settings = this.getSettings();
    this.log('Device settings:', {
      host: settings.host,
      https: settings.https,
      username: settings.username,
      poll_interval: settings.poll_interval,
    });

    // Track first status update to trigger flows for existing alarms
    this.firstStatusUpdate = true;
    
    // Track last zone alarm state
    this.lastZoneAlarm = null;

    // Initialize the API connection
    this.api = null;
    await this.initializeAPI();

    // Start polling
    this.startPolling();

    // Register capability listeners
    this.registerCapabilityListener('homealarm_state', this.onCapabilityHomealarmState.bind(this));
    
    // Register flow card conditions
    this.registerFlowCardConditions();
  }
  
  /**
   * Register flow card condition listeners
   */
  registerFlowCardConditions() {
    // Alarm message contains
    this.homey.flow.getConditionCard('alarm_message_contains')
      .registerRunListener(async (args, state) => {
        const currentMessage = this.getCapabilityValue('alarm_message') || '';
        const searchText = args.text.toLowerCase();
        return currentMessage.toLowerCase().includes(searchText);
      });
    
    // Alarm message equals
    this.homey.flow.getConditionCard('alarm_message_equals')
      .registerRunListener(async (args, state) => {
        const currentMessage = this.getCapabilityValue('alarm_message') || '';
        return currentMessage === args.message;
      });
    
    // Has active alarm
    this.homey.flow.getConditionCard('has_active_alarm')
      .registerRunListener(async (args, state) => {
        return this.getCapabilityValue('alarm_generic') === true;
      });
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
      
      // Store old values for comparison
      const oldState = this.getCapabilityValue('homealarm_state');
      const oldAlarm = this.getCapabilityValue('alarm_generic');
      
      // Update capabilities
      await this.setCapabilityValue('homealarm_state', status.state);
      await this.setCapabilityValue('alarm_generic', status.alarm);
      
      // Trigger flows based on state changes
      
      // Alarm cleared trigger
      if (oldAlarm === true && status.alarm === false) {
        this.log('Alarm cleared');
        this.homey.flow.getDeviceTriggerCard('alarm_cleared')
          .trigger(this)
          .catch(err => this.error('Error triggering alarm_cleared:', err));
      }
      
      // System armed trigger
      if (oldState === 'disarmed' && (status.state === 'armed' || status.state === 'partially_armed')) {
        this.log('System armed:', status.state);
        this.homey.flow.getDeviceTriggerCard('system_armed')
          .trigger(this, { mode: status.state })
          .catch(err => this.error('Error triggering system_armed:', err));
      }
      
      // System disarmed trigger
      if ((oldState === 'armed' || oldState === 'partially_armed') && status.state === 'disarmed') {
        this.log('System disarmed');
        this.homey.flow.getDeviceTriggerCard('system_disarmed')
          .trigger(this)
          .catch(err => this.error('Error triggering system_disarmed:', err));
      }
      
      // Update alarm message if available
      if (this.hasCapability('alarm_message')) {
        const oldMessage = this.getCapabilityValue('alarm_message');
        const newMessage = status.alarmMessage || '-';
        
        this.log('Alarm message update - old:', oldMessage, 'new:', newMessage, 'status.alarmMessage:', status.alarmMessage);
        
        await this.setCapabilityValue('alarm_message', newMessage);
        
        // Trigger flow when a new alarm message appears (not None)
        // Also trigger on first status update if there's already an active alarm
        const isNewAlarm = status.alarmMessage && status.alarmMessage !== oldMessage;
        const isExistingAlarmOnStartup = this.firstStatusUpdate && status.alarmMessage;
        
        if (isNewAlarm || isExistingAlarmOnStartup) {
          this.log('New system alert detected:', status.alarmMessage, '(firstUpdate:', this.firstStatusUpdate, ')');
          
          // Trigger the system_alert_active flow for all system alerts (Tamper, Fault, etc.)
          this.log('Triggering system_alert_active with:', status.alarmMessage);
          this.homey.flow.getDeviceTriggerCard('system_alert_active')
            .trigger(this, { alert_type: status.alarmMessage })
            .then(() => this.log('system_alert_active triggered successfully'))
            .catch(err => this.error('Error triggering system_alert_active:', err));
        }
        
        // Trigger flow when a system alert is cleared (becomes None/null)
        if (!status.alarmMessage && oldMessage && oldMessage !== '-') {
          this.log('System alert cleared, was:', oldMessage);
          
          // Trigger the system_alert_cleared flow for all system alerts
          this.log('Triggering system_alert_cleared with:', oldMessage);
          this.homey.flow.getDeviceTriggerCard('system_alert_cleared')
            .trigger(this, { alert_type: oldMessage })
            .then(() => this.log('system_alert_cleared triggered successfully'))
            .catch(err => this.error('Error triggering system_alert_cleared:', err));
        }
        
        // Clear first update flag after processing
        if (this.firstStatusUpdate) {
          this.firstStatusUpdate = false;
        }
      }
      
      // Handle zone alarms separately from system alerts
      const currentZoneAlarm = status.zoneAlarm ? JSON.stringify(status.zoneAlarm) : null;
      const previousZoneAlarm = this.lastZoneAlarm || null;
      
      if (currentZoneAlarm !== previousZoneAlarm) {
        this.log('Zone alarm state changed - old:', previousZoneAlarm, 'new:', currentZoneAlarm);
        
        // Zone alarm triggered
        if (status.zoneAlarm && !previousZoneAlarm) {
          this.log('Zone alarm triggered:', status.zoneAlarm);
          this.homey.flow.getDeviceTriggerCard('zone_alarm_triggered')
            .trigger(this, {
              zone_number: status.zoneAlarm.zone,
              zone_name: status.zoneAlarm.name
            })
            .then(() => this.log('zone_alarm_triggered flow executed successfully'))
            .catch(err => this.error('Error triggering zone_alarm_triggered:', err));
        }
        
        // Zone alarm cleared
        if (!status.zoneAlarm && previousZoneAlarm) {
          const prevAlarm = JSON.parse(previousZoneAlarm);
          this.log('Zone alarm cleared:', prevAlarm);
          this.homey.flow.getDeviceTriggerCard('zone_alarm_cleared')
            .trigger(this, {
              zone_number: prevAlarm.zone,
              zone_name: prevAlarm.name
            })
            .then(() => this.log('zone_alarm_cleared flow executed successfully'))
            .catch(err => this.error('Error triggering zone_alarm_cleared:', err));
        }
        
        // Update last zone alarm
        this.lastZoneAlarm = currentZoneAlarm;
      }
      
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
