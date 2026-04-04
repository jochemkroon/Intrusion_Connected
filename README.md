# Intrusion Connected for Homey

Connect your alarm panel to Homey via the local web interface.

## Description

This Homey app provides integration for alarm panels with HTML-based web interfaces, allowing you to control and monitor your alarm system directly from Homey. The app communicates with your alarm panel over your local network (LAN) without requiring cloud services.

## Important Notice

⚠️ **Unofficial Integration**

This is an **unofficial, community-developed driver** and is not affiliated with, endorsed by, or supported by ACRE (formerly Vanderbilt) or any alarm panel manufacturer.

- **SPC** is a trademark of ACRE Security (formerly Vanderbilt Industries)
- This app is a **workaround** based on reverse-engineering the alarm panel's web interface
- It is **not an official API integration** and may stop working if the panel's web interface changes
- Use at your own risk - the developer is not responsible for any issues with your alarm system
- This integration is provided as-is without warranty

For official integrations and support, please contact ACRE Security directly.

## Features

- 🔒 **Arm/Disarm Control** - Fully arm, partially arm, or disarm your alarm system
- 📊 **Real-time Status** - Monitor your alarm panel status with configurable polling
- 🚨 **Alarm Notifications** - Get instant notifications when an alarm is triggered
- 🔄 **Automation Support** - Create Flows based on alarm states and events
- 🌐 **Local Communication** - All communication happens over your local network
- 🔐 **Secure** - Supports both HTTP and HTTPS connections

## Supported Panels

- SPC 4200/4300
- SPC 5200/5300
- SPC 6300
- Other alarm panels with compatible web interfaces

## Installation

### From Homey App Store (when published)
1. Open the Homey app on your mobile device
2. Go to "More" → "Apps"
3. Search for "Intrusion Connected"
4. Tap "Install"

### Manual Installation (for development)
1. Clone this repository
2. Install the Homey CLI: `npm install -g homey`
3. Navigate to the app directory
4. Run `homey app install`

## Configuration

### Adding Your Alarm Panel

1. In the Homey app, go to "Devices" → "Add Device"
2. Select "Intrusion Connected"
3. Select "Alarm Panel"
4. Configure your panel:
   - **Alarm Panel Type**: Select your panel model
   - **IP Address**: Enter the IP address of your alarm panel
   - **Use HTTPS**: Enable if your panel uses HTTPS (port 443)
   - **User ID**: Your alarm panel username
   - **Password**: Your alarm panel password
   - **Poll Interval**: How often to check status (default: 5 seconds)

### Settings

After adding the device, you can adjust these settings:

- **Connection Settings**
  - IP Address or Hostname
  - HTTPS enabled/disabled
  - Username and Password
  
- **Advanced Settings**
  - Poll Interval (1-60 seconds)

## Usage

### Capabilities

The alarm panel device provides these capabilities:

- **Alarm State** (`homealarm_state`): 
  - `disarmed` - Alarm is off
  - `partially_armed` - Partial arming (home mode)
  - `armed` - Full arming (away mode)

- **Alarm Status** (`alarm_generic`):
  - `true` - Alarm is triggered
  - `false` - No alarm

### Flow Cards

#### Triggers
- **Alarm turned on** - When the alarm is triggered
- **Alarm state changed** - When arming state changes

#### Conditions
- **Alarm is** [armed/disarmed/partially armed]
- **Alarm is triggered**

#### Actions
- **Set alarm state to** [armed/disarmed/partially armed]

### Example Flows

**Arm alarm when leaving home:**
```
WHEN: Location changed to Away
THEN: Set Alarm Panel to Armed
```

**Alert on intrusion:**
```
WHEN: Alarm Panel alarm turned on
THEN: Send notification "ALARM! Possible intrusion detected"
AND:  Turn on all lights
AND:  Start recording cameras
```

**Disarm when arriving home:**
```
WHEN: Location changed to Home
THEN: Set Alarm Panel to Disarmed
```

## Troubleshooting

### Connection Issues

**Problem**: "Connection to alarm panel failed"

Solutions:
- Verify the IP address is correct
- Ensure your Homey and alarm panel are on the same network
- Check if the alarm panel's web interface is accessible from a browser
- Verify username and password are correct
- Try disabling HTTPS if connection fails

**Problem**: "Device unavailable"

Solutions:
- Check if the alarm panel is powered on and connected to the network
- Verify network connectivity between Homey and the panel
- Restart the Homey app or device
- Increase the poll interval if the panel is slow to respond

### Authentication Issues

If you get login errors:
- Double-check your username and password
- Ensure the user account has the correct permissions on the panel
- Try logging in via the panel's web interface to verify credentials

## Development

### Prerequisites
- Node.js >= 12.4.0
- Homey CLI (`npm install -g homey`)

### Setup
```bash
git clone <repository-url>
cd com.kroonembedded.spc
npm install
```

### Running
```bash
# Run in development mode
homey app run

# Build the app
homey app build

# Install on your Homey
homey app install
```

### Project Structure
```
├── app.js                  # Main app file
├── app.json               # Generated app manifest
├── .homeycompose/         # Source files for app.json
│   ├── app.json          # App configuration
│   └── drivers/          # Driver configurations
├── drivers/
│   └── panel/            # Alarm panel driver
│       ├── device.js     # Device logic
│       ├── driver.js     # Driver logic
│       └── pair/         # Pairing wizard
├── lib/
│   └── spc-api.js        # API client for alarm panel
└── locales/              # Translations
```

## Technical Implementation

### How It Works

This app works by **reverse-engineering and scraping the alarm panel's HTML-based web interface**. It does not use an official API.


**Limitations:**
- Relies on HTML structure - may break if the panel firmware updates change the web interface
- No real-time push notifications - relies on polling (default: every 5 seconds)
- Limited to features visible in the web interface
- May not support all alarm panel features

**Why This Approach?**
ACRE/Vanderbilt does not provide a public API for their SPC alarm panels. This integration was created to enable smart home automation for users who want to integrate their existing alarm systems with Homey.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Adding Support for New Panels

To add support for a new alarm panel type:

1. Add the panel type to `drivers/panel/driver.compose.json`:
```json
{
  "id": "new_panel",
  "label": {
    "en": "New Panel Model"
  }
}
```

2. Add the option to `drivers/panel/pair/login.html`

3. Update the `panelTypeNames` mapping in `drivers/panel/driver.js`

4. If needed, extend the API client in `lib/spc-api.js` to handle panel-specific communication

## Privacy & Security

- This app communicates directly with your alarm panel over your local network
- No data is sent to external servers or cloud services
- Passwords are stored securely in Homey's encrypted device settings
- All communication can be secured using HTTPS

## License

This project is licensed under the GPL-3.0 License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests, please:
- Open an issue on GitHub
- Check existing issues for solutions

## Credits

- Icon by Freepik from Flaticon
- Developed by Jochem Kroon

## Changelog

### Version 1.0.0 (2026-04-04)
- Initial release
- Support for SPC 4200/4300/5200/5300/6300 panels
- Basic arm/disarm functionality
- Alarm status monitoring
- Configurable polling interval
- Flow card support
