# WebXR AR Sphere Demo

A simple proof of concept for placing a 3D sphere in augmented reality using WebXR and Three.js.

## Requirements

WebXR AR requires:
- **Android**: Chrome 81+ with ARCore support
- **iOS**: Safari 15+ with ARKit support  
- **HTTPS connection** (localhost works for development)

## Running the App

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open on your AR-capable device:
   - For local testing: `http://localhost:3001`
   - For network testing: `http://[YOUR-IP]:3001`

## How to Use

1. Open the app on an AR-capable device
2. Tap "Start AR Experience" 
3. Point your camera at a flat surface (table, floor)
4. A white ring will appear when a surface is detected
5. Tap "Place Sphere" to place a green sphere at that location

## Troubleshooting

- **"WebXR AR is not supported"**: Your device/browser doesn't support AR. Try Chrome on Android or Safari on iOS.
- **Nothing happens when clicking Start**: Check the browser console for errors. You may need to enable WebXR flags in your browser.
- **No surfaces detected**: Ensure good lighting and point at a textured flat surface.

## Browser Setup

### Chrome on Android
- Ensure ARCore is installed from Google Play
- Chrome should work out of the box

### Safari on iOS  
- Requires iOS 15+
- Enable WebXR in Settings > Safari > Advanced > Feature Flags
