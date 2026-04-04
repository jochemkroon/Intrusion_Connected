'use strict';

const Homey = require('homey');

module.exports = class SPCPanelDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('SPC Panel Driver has been initialized');
  }

  /**
   * onPair is called when a user starts pairing.
   */
  async onPair(session) {
    this.log('Pairing session started');

    // Store session data locally
    let sessionData = {};

    session.setHandler('login', async (data) => {
      this.log('Login data received:', { username: data.username, host: data.host, https: data.https, panel_type: data.panel_type, poll_interval: data.poll_interval });

      // Store the credentials for the list_devices step
      sessionData = {
        panel_type: data.panel_type || 'generic',
        host: data.host,
        https: data.https || false,
        username: data.username,
        password: data.password,
        poll_interval: data.poll_interval || 5,
      };

      // Test the connection to the SPC panel
      try {
        const api = this.homey.app.createSPCApi({
          ...sessionData,
          debug: true,
        });
        await api.testConnection();
        
        this.log('Connection test successful');
        return true;
      } catch (error) {
        this.error('Connection test failed:', error);
        throw new Error('Connection failed. Please check your settings and try again.');
      }
    });

    session.setHandler('list_devices', async () => {
      this.log('List devices called with session data:', { host: sessionData.host, panel_type: sessionData.panel_type });
      
      const devices = [];
      
      if (sessionData && sessionData.host && sessionData.username) {
        // Create a friendly name based on panel type
        const panelTypeNames = {
          spc4200: 'SPC 4200/4300',
          spc5000: 'SPC 5200/5300',
          spc6000: 'SPC 6300',
          generic: 'Alarm Panel',
        };
        const panelTypeName = panelTypeNames[sessionData.panel_type] || 'Alarm Panel';
        
        devices.push({
          name: `${panelTypeName} (${sessionData.host})`,
          data: {
            id: `${sessionData.panel_type || 'panel'}_${sessionData.host.replace(/\./g, '_')}`,
          },
          settings: {
            panel_type: sessionData.panel_type || 'generic',
            host: sessionData.host,
            https: sessionData.https || false,
            username: sessionData.username,
            password: sessionData.password,
            poll_interval: sessionData.poll_interval || 5,
          },
        });
      }

      return devices;
    });
  }

};
