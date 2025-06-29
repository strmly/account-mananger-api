/**
 * Environment Setup for Tests
 * This file runs before any tests and sets up the test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Disable console output during tests (can be overridden)
if (!process.env.JEST_VERBOSE) {
  const originalConsole = { ...console };
  
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  
  // Allow console output in specific cases
  global.originalConsole = originalConsole;
}

// Set up global test timeout
jest.setTimeout(30000);

// Mock Date for consistent testing
const mockDate = new Date('2024-01-01T00:00:00.000Z');
global.mockDate = mockDate;

// Mock Math.random for predictable tests
const originalMathRandom = Math.random;
let mockRandomValue = 0.5;

Math.random = jest.fn(() => mockRandomValue);
global.setMockRandom = (value) => {
  mockRandomValue = value;
};

global.restoreMathRandom = () => {
  Math.random = originalMathRandom;
};

// Global cleanup function
global.cleanupTestEnvironment = () => {
  // Reset mocks
  jest.clearAllMocks();
  
  // Reset Math.random
  mockRandomValue = 0.5;
  
  // Clear any global state
  delete global.testData;
};

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  if (process.env.NODE_ENV === 'test') {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process in tests
  }
});

// Memory usage monitoring
global.getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(usage.external / 1024 / 1024 * 100) / 100
  };
};

// Performance measurement utilities
global.measurePerformance = (fn) => {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1000000; // Convert to milliseconds
  
  return {
    result,
    duration
  };
};

global.measureAsyncPerformance = async (fn) => {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1000000; // Convert to milliseconds
  
  return {
    result,
    duration
  };
};

// Test data cleanup tracker
global.testCleanupTasks = [];

global.addCleanupTask = (task) => {
  global.testCleanupTasks.push(task);
};

global.runCleanupTasks = async () => {
  for (const task of global.testCleanupTasks) {
    try {
      await task();
    } catch (error) {
      console.error('Cleanup task failed:', error);
    }
  }
  global.testCleanupTasks = [];
};

// Test isolation helpers
global.isolateTest = (testFn) => {
  return async () => {
    // Save current state
    const originalEnv = { ...process.env };
    
    try {
      // Run test
      await testFn();
    } finally {
      // Restore state
      process.env = originalEnv;
      global.cleanupTestEnvironment();
      await global.runCleanupTasks();
    }
  };
};

// Database state helpers
global.withCleanDatabase = (testFn) => {
  return async () => {
    const redis = require('redis');
    const redisClient = redis.createClient();
    
    try {
      // Clear database before test
      await redisClient.flushAll();
      
      // Run test
      await testFn();
    } finally {
      // Clear database after test
      await redisClient.flushAll();
    }
  };
};

// HTTP request helpers
global.expectValidResponse = (response, expectedStatus = 200) => {
  expect(response).toBeDefined();
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toBeDefined();
};

global.expectErrorResponse = (response, expectedStatus, expectedError) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.body.error).toBeDefined();
  if (expectedError) {
    expect(response.body.error).toContain(expectedError);
  }
};

// Validation helpers
global.expectValidUUID = (value) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  expect(value).toMatch(uuidRegex);
};

global.expectValidEmail = (value) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  expect(value).toMatch(emailRegex);
};

global.expectValidISO8601Date = (value) => {
  const date = new Date(value);
  expect(date).toBeInstanceOf(Date);
  expect(date.getTime()).not.toBeNaN();
  expect(date.toISOString()).toBe(value);
};

// Test categorization
global.testCategories = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  E2E: 'e2e'
};

global.describeCategory = (category, name, tests) => {
  const categoryLabel = `[${category.toUpperCase()}]`;
  describe(`${categoryLabel} ${name}`, tests);
};

// Skip tests conditionally
global.describeIf = (condition, name, tests) => {
  if (condition) {
    describe(name, tests);
  } else {
    describe.skip(name, tests);
  }
};

global.testIf = (condition, name, test) => {
  if (condition) {
    it(name, test);
  } else {
    it.skip(name, test);
  }
};

// Test configuration
global.testConfig = {
  isCI: process.env.CI === 'true',
  verbose: process.env.JEST_VERBOSE === 'true',
  coverage: process.env.JEST_COVERAGE === 'true',
  performance: process.env.JEST_PERFORMANCE !== 'false',
  security: process.env.JEST_SECURITY !== 'false'
};

// Logging for debugging
global.testLog = (...args) => {
  if (global.testConfig.verbose) {
    global.originalConsole.log('[TEST]', ...args);
  }
};

global.testError = (...args) => {
  global.originalConsole.error('[TEST ERROR]', ...args);
};

// Initialize test environment
global.testLog('Test environment initialized');
global.testLog('Configuration:', global.testConfig);
global.testLog('Memory usage:', global.getMemoryUsage());