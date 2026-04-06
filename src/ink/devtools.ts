// React DevTools integration for development mode only
// This module is conditionally imported in reconciler.ts when NODE_ENV === 'development'

// Only attempt to connect in browser environments
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
}

export {};
