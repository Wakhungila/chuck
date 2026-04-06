// React DevTools integration for development mode only
// This module is conditionally imported in reconciler.ts when NODE_ENV === 'development'

// Stub for production builds - prevents "window is not defined" errors
// This file should only be imported in browser environments
if (typeof window === 'undefined') {
  // Running in Node.js - skip devtools entirely
  export {};
} else {
  // Only attempt to connect in browser environments
  try {
    const devtools = require('react-devtools-core');
    devtools.connectToDevTools({
      host: 'localhost',
      port: 8097,
    });
  } catch (error) {
    // Silently fail - devtools are optional
    console.warn('React DevTools not available:', error);
  }
  export {};
}
