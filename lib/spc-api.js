'use strict';

const http = require('http');
const https = require('https');

/**
 * SPC (Vanderbilt/ACRE) API Client
 * 
 * This class handles communication with the SPC panel via its web server.
 * You'll need to implement the actual API calls based on your reverse engineering.
 */
class SPCApi {
  
  constructor(options) {
    this.host = options.host;
    this.useHttps = options.https || false;
    this.port = this.useHttps ? 443 : 80;
    this.username = options.username;
    this.password = options.password;
    this.timeout = options.timeout || 30000; // Increased to 30 seconds
    this.debug = options.debug || false;
    
    // Session management
    this.sessionId = null;
    this.cookies = [];
    this.authenticated = false;
  }

  log(...args) {
    if (this.debug) {
      console.log('[SPC API]', ...args);
    }
  }

  /**
   * Extract session ID from HTML response
   */
  extractSessionId(html) {
    const match = html.match(/session=(0x[A-F0-9]+)/i);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Make an HTTP request to the SPC panel
   */
  async request(method, path, data = null, contentType = 'application/json') {
    return new Promise((resolve, reject) => {
      const protocol = this.useHttps ? https : http;
      
      // Prepare request body
      let requestBody = '';
      if (data) {
        if (contentType === 'application/json') {
          requestBody = JSON.stringify(data);
        } else {
          requestBody = data;
        }
      }
      
      const options = {
        hostname: this.host,
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Content-Type': contentType,
          'User-Agent': 'Homey-SPC/1.0',
          'Accept': '*/*',
          'Connection': 'close',
        },
        timeout: this.timeout,
      };

      // Add Content-Length header if we have data
      if (requestBody) {
        options.headers['Content-Length'] = Buffer.byteLength(requestBody);
      }

      // Add session cookies if available
      if (this.cookies.length > 0) {
        options.headers['Cookie'] = this.cookies.join('; ');
      }

      this.log(`${method} ${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}${path}`);
      if (requestBody && this.debug) {
        this.log('Request body:', requestBody);
      }

      const req = protocol.request(options, (res) => {
        this.log(`Response status: ${res.statusCode}`);
        this.log('Response headers:', JSON.stringify(res.headers));
        
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
          const location = res.headers.location;
          this.log('Redirect to:', location);
          
          // For now, just read the response body and resolve
          // The session should be in the redirect location
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            // Check if location contains session
            if (location) {
              const sessionMatch = location.match(/session=(0x[A-F0-9]+)/i);
              if (sessionMatch) {
                this.log('Found session in redirect:', sessionMatch[1]);
              }
            }
            resolve(location || body);
          });
          return;
        }
        
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          this.log('Response body:', body.substring(0, 200));
          
          // Store cookies from response
          const setCookies = res.headers['set-cookie'];
          if (setCookies) {
            setCookies.forEach(cookie => {
              const cookieStr = cookie.split(';')[0];
              const cookieName = cookieStr.split('=')[0];
              // Update or add cookie
              const index = this.cookies.findIndex(c => c.startsWith(cookieName + '='));
              if (index >= 0) {
                this.cookies[index] = cookieStr;
              } else {
                this.cookies.push(cookieStr);
              }
            });
            this.log('Stored cookies:', this.cookies);
          }

          // Parse response
          try {
            const response = body ? JSON.parse(body) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${response.message || body}`));
            }
          } catch (error) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          }
        });
      });

      req.on('error', (error) => {
        this.log('Request error:', error.message);
        reject(new Error(`Connection failed: ${error.message}`));
      });

      req.on('timeout', () => {
        this.log('Request timeout after', this.timeout, 'ms');
        req.destroy();
        reject(new Error('Request timeout'));
      });

      // Send request data if provided
      if (requestBody) {
        req.write(requestBody);
      }

      req.end();
    });
  }

  /**
   * Test the connection to the SPC panel
   */
  async testConnection() {
    try {
      // Test by attempting to login
      await this.login();
      return true;
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Authenticate with the SPC panel
   */
  async login() {
    try {
      // Prepare form data
      const formData = `userid=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
      
      this.log('Logging in as:', this.username);
      
      // Send login request
      const response = await this.request(
        'POST',
        '/login.htm?action=login&language=0',
        formData,
        'application/x-www-form-urlencoded'
      );
      
      this.log('Login response type:', typeof response);
      this.log('Login response preview:', response ? response.substring(0, 300) : 'empty');
      
      // Extract session ID from response (could be HTML or redirect URL)
      this.sessionId = this.extractSessionId(response);
      
      if (!this.sessionId) {
        throw new Error('No session ID received from login');
      }
      
      this.log('Logged in with session:', this.sessionId);
      this.authenticated = true;
      return response;
    } catch (error) {
      this.authenticated = false;
      this.log('Login error:', error.message);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Get the current status of the panel
   */
  async getStatus() {
    if (!this.sessionId) {
      await this.login();
    }

    try {
      const html = await this.request(
        'GET',
        `/secure.htm?session=${this.sessionId}&page=system_summary`
      );

      // Parse status from HTML
      const status = this.parseStatus(html);
      return status;
    } catch (error) {
      // Try to re-login if session expired
      if (error.message.includes('401') || error.message.includes('403')) {
        this.log('Session expired, re-logging in');
        await this.login();
        return this.getStatus();
      }
      throw error;
    }
  }

  /**
   * Parse status from HTML response
   */
  parseStatus(html) {
    // Look for status indicators in the HTML
    const status = {
      state: 'disarmed',
      alarm: false,
      ready: true,
    };

    // Find the status text in the "All Areas" row
    // Look for: <td style="color:blue; font-weight:bold;">STATUS</td>
    const statusMatch = html.match(/<td[^>]*class="subhead"[^>]*>(?:All Areas|Alle gebieden)<\/td>\s*<td[^>]*style="color:blue[^>]*>([^<]+)</);
    
    if (statusMatch) {
      const statusText = statusMatch[1].trim();
      this.log('Found status text:', statusText);
      
      if (statusText.toLowerCase().includes('unset') || statusText.toLowerCase().includes('uit')) {
        status.state = 'disarmed';
      } else if (statusText.toLowerCase().includes('deel') || statusText.toLowerCase().includes('part')) {
        status.state = 'partially_armed';
      } else if (statusText.toLowerCase().includes('full') || statusText.toLowerCase().includes('vol')) {
        status.state = 'armed';
      }
    }

    // Check for alarm condition - look for red text in Active System Alerts
    // But make sure it's not just "None"
    if (html.includes('Active System Alerts') || html.includes('Actieve systeemwaarschuwingen')) {
      const alertMatch = html.match(/Active System Alerts[\s\S]{0,500}<td>(?!None)([^<]+)<\/td>[\s\S]{0,100}color:red/i);
      if (alertMatch) {
        status.alarm = true;
      }
    }

    this.log('Parsed status:', status);
    return status;
  }

  /**
   * Set the alarm state (arm/disarm)
   */
  async setAlarmState(state) {
    if (!this.sessionId) {
      await this.login();
    }

    try {
      let action, value;
      switch (state) {
        case 'armed':
          action = 'fullset_area1';
          value = 'Fullset';
          break;
        case 'partially_armed':
          action = 'partset_a_area1';
          value = 'Deelschakeling';
          break;
        case 'disarmed':
          action = 'unset_area1';
          value = 'Unset';
          break;
        default:
          throw new Error(`Unknown state: ${state}`);
      }

      this.log('Setting alarm state to:', state, 'with action:', action, 'value:', value);

      // Send POST request to set alarm state
      const formData = `${action}=${encodeURIComponent(value)}`;
      const response = await this.request(
        'POST',
        `/secure.htm?session=${this.sessionId}&page=system_summary&action=update`,
        formData,
        'application/x-www-form-urlencoded'
      );

      return true;
    } catch (error) {
      // Try to re-login if session expired
      if (error.message.includes('401') || error.message.includes('403')) {
        this.log('Session expired, re-logging in');
        await this.login();
        return this.setAlarmState(state);
      }
      throw error;
    }
  }

  /**
   * Get all zones
   */
  async getZones() {
    // TODO: Implement actual zones endpoint
    // Example: return await this.request('GET', '/spc/zones');
    
    return [];
  }

  /**
   * Get all areas
   */
  async getAreas() {
    // TODO: Implement actual areas endpoint
    // Example: return await this.request('GET', '/spc/areas');
    
    return [];
  }

  /**
   * Disconnect from the panel
   */
  async disconnect() {
    if (this.sessionId) {
      try {
        await this.request(
          'GET',
          `/login.htm?session=${this.sessionId}&action=logoff`
        );
      } catch (error) {
        this.log('Logoff error:', error.message);
      }
    }
    this.authenticated = false;
    this.sessionId = null;
    this.cookies = [];
  }

}

module.exports = SPCApi;
