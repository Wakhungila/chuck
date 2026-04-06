// Stub module for react-devtools-core in production builds
// This prevents "window is not defined" errors when bundling for Node.js

export function connectToDevTools(options?: any) {
  // No-op in production
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('React DevTools would connect here in development mode');
  }
}

export default {
  connectToDevTools
};
