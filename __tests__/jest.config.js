module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  
  // Test patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/__tests__/utils/',
    '/__tests__/setup.js'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable via CLI flag
  collectCoverageFrom: [
    '**/*.js',
    '!node_modules/**',
    '!coverage/**',
    '!__tests__/**',
    '!jest.config.js',
    '!test-runner.js'
  ],
  
  coverageDirectory: 'coverage',
  
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
    'cobertura'
  ],
  
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    },
    './server.js': {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90
    }
  },
  
  // Reporting
  verbose: false, // Enable via CLI flag
  
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './coverage',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  
  // Timeouts
  testTimeout: 30000, // 30 seconds
  
  // Module resolution
  moduleFileExtensions: ['js', 'json'],
  
  // Transform
  transform: {},
  
  // Globals
  globals: {
    __DEV__: true,
    __TEST__: true
  },
  
  // Environment variables
  setupFiles: ['<rootDir>/__tests__/env.setup.js'],
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Performance
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  
  // Bail on first failure (disable for CI)
  bail: false,
  
  // Force exit to prevent hanging
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Watch mode configuration
  watchman: true,
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/.git/'
  ],
  
  // Test suites configuration
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/__tests__/middleware.test.js',
        '<rootDir>/__tests__/utils/*.test.js'
      ],
      testTimeout: 10000
    },
    {
      displayName: 'integration',
      testMatch: [
        '<rootDir>/__tests__/server.test.js',
        '<rootDir>/__tests__/integration.test.js'
      ],
      testTimeout: 30000
    },
    {
      displayName: 'performance',
      testMatch: [
        '<rootDir>/__tests__/performance.test.js'
      ],
      testTimeout: 60000
    },
    {
      displayName: 'security',
      testMatch: [
        '<rootDir>/__tests__/security.test.js'
      ],
      testTimeout: 45000
    }
  ],
  
  // Custom test environments for different test types
  testEnvironmentOptions: {
    node: {
      // Node.js specific options
    }
  },
  
  // Module name mapping (for absolute imports if needed)
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tests/(.*)$': '<rootDir>/__tests__/$1'
  },
  
  // Snapshot configuration
  snapshotSerializers: [],
  
  // Custom matchers
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup.js',
    '<rootDir>/__tests__/custom-matchers.js'
  ]
};