'use strict';

const Homey = require('homey');
const SPCApi = require('./lib/spc-api');

module.exports = class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Intrusion connected App has been initialized');
    
    // Initialize pair session storage
    this.pairSession = {};
  }

  /**
   * Create a new SPC API client instance
   */
  createSPCApi(options) {
    return new SPCApi(options);
  }

};
