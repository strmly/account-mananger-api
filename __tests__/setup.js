const { beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '5001'; // Different port for testing

// Global test timeout
jest.setTimeout(30000);

// ===== REDIS MOCK SETUP - This is the critical missing piece =====
jest.mock('redis', () => {
  // now this require is local to the factory
  const redisMock = require('redis-mock');

  // wrap and patch createClient for v4+ API
  const origCreate = redisMock.createClient;
  redisMock.createClient = (...args) => {
    const client = origCreate(...args);

    // patch setEx
    client.setEx = client.setEx || ((key, ttl, val) =>
      new Promise((res, rej) =>
        client.setex(key, ttl, val, (e, r) => (e ? rej(e) : res(r)))
      )
    );

    // patch connect/quit
    client.connect = client.connect || (async () => Promise.resolve());
    client.quit    = client.quit    || (async () => Promise.resolve());
    Object.defineProperty(client, 'isOpen', {
      get: () => true,
      configurable: true
    });

    // patch ping
    client.ping = client.ping || (async () => 'PONG');

    // patch keys
    client.keys = client.keys || (pattern =>
      new Promise(res => {
        const all = Object.keys(client.storage || {});
        if (pattern === '*') return res(all);
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1);
          return res(all.filter(k => k.startsWith(prefix)));
        }
        res(all.filter(k => k === pattern));
      })
    );

    // promise-ify get/set/del
    ['get','set','del'].forEach(cmd => {
      const orig = client[cmd].bind(client);
      client[cmd] = (...args) =>
        new Promise((res, rej) =>
          orig(...args, (e, r) => (e ? rej(e) : res(r)))
        );
    });

    // flushall
    client.flushall = client.flushall || (async () => {
      client.storage = {};
      return 'OK';
    });

    return client;
  };

  // export exactly the same interface as the real 'redis' package
  return { createClient: (...args) => redisMock.createClient(...args) };
});
// ===== END REDIS MOCK SETUP =====

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global setup for each test
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Global cleanup after each test
afterEach(() => {
  // Any cleanup needed after each test
});

// Helper functions for tests
global.testHelpers = {
  // Generate test user data
  generateTestUser: (overrides = {}) => ({
    username: `testuser_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    email: `test_${Date.now()}_${Math.random().toString(36).substr(2, 5)}@example.com`,
    password: 'testpassword123',
    firstName: 'Test',
    lastName: 'User',
    role:     'trader',
    ...overrides
  }),

  // Generate test account data
  generateTestAccount: (overrides = {}) => ({
    account_number: `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    password: 'account_password',
    server: 'TestServer-MT5',
    account_type: 'Forex',
    ...overrides
  }),

  // Wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random string
  randomString: (length = 10) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Create test session token
  createTestSession: async (user, redisClient) => {
    const { v4: uuidv4 } = require('uuid');
    const sessionId = uuidv4();
    const sessionData = {
      user_id: user.id,
      username: user.username,
      role: user.role,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    await redisClient.setEx(`session:${sessionId}`, 86400, JSON.stringify(sessionData));
    return sessionId;
  },

  // Create authenticated user for testing
  createAuthenticatedUser: async (app, role = 'trader', redisClient = null) => {
    const request = require('supertest');
    const userData = global.testHelpers.generateTestUser();

    // 1) register
    await request(app)
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    // 2) bump role in Redis so next login sees it
    if (role !== 'trader' && redisClient) {
      const raw = await redisClient.get('platform_users') || '[]';
      const users = JSON.parse(raw);
      const idx   = users.findIndex(u => u.username === userData.username);
      if (idx !== -1) {
        users[idx].role = role;
        await redisClient.set('platform_users', JSON.stringify(users));
      }
    }

    // 3) login again → get session with correct role
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: userData.username, password: userData.password })
      .expect(200);

    return {
      user:   userData,
      token:  loginRes.body.session_id,
      userId: loginRes.body.user.id
    };
  },

  // Get Redis client instance for manual operations
  getRedisClient: () => {
    const redis = require('redis');
    return redis.createClient();
  },

  // Clear all Redis data
  clearRedisData: async (redisClient) => {
    if (redisClient && redisClient.flushall) {
      await redisClient.flushall();
    }
  },

  // Validate response structure
  validateUserResponse: (user) => {
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('firstName');
    expect(user).toHaveProperty('lastName');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('status');
    expect(user).toHaveProperty('created_at');
    expect(user).not.toHaveProperty('password'); // Password should not be in response
  },

  validateAccountResponse: (account) => {
    expect(account).toHaveProperty('id');
    expect(account).toHaveProperty('account_number');
    expect(account).toHaveProperty('server');
    expect(account).toHaveProperty('account_type');
    expect(account).toHaveProperty('status');
    expect(account).toHaveProperty('balance');
    expect(account).toHaveProperty('equity');
    expect(account).toHaveProperty('created_at');
  },

  // Create test data sets
  createTestUsers: (count = 3) => {
    const users = [];
    const roles = ['admin', 'manager', 'trader'];
    
    for (let i = 0; i < count; i++) {
      users.push({
        username: `testuser${i}_${Date.now()}`,
        email: `testuser${i}_${Date.now()}@example.com`,
        password: 'testpassword123',
        firstName: `Test${i}`,
        lastName: `User${i}`,
        role: roles[i % roles.length]
      });
    }
    
    return users;
  },

  createTestAccounts: (count = 3) => {
    const accounts = [];
    const types = ['Forex', 'FTMO'];
    
    for (let i = 0; i < count; i++) {
      accounts.push({
        account_number: `${Date.now()}${i.toString().padStart(3, '0')}`,
        password: `password${i}`,
        server: `TestServer${i}-MT5`,
        account_type: types[i % types.length]
      });
    }
    
    return accounts;
  }
};

// Custom matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },

  toBeValidEmail(received) {
    const emailRegex = /^(?!.*\.\.)[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false,
      };
    }
  },

  toBeValidISO8601Date(received) {
    const date = new Date(received);
    const pass = date instanceof Date && !isNaN(date.getTime()) && date.toISOString() === received;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ISO 8601 date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ISO 8601 date`,
        pass: false,
      };
    }
  },

  toHaveValidUserStructure(received) {
    const requiredFields = ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'status', 'created_at'];
    const missingFields = requiredFields.filter(field => !(field in received));
    const hasPassword = 'password' in received;
    
    if (missingFields.length === 0 && !hasPassword) {
      return {
        message: () => `expected user object to be invalid`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected user object to have all required fields ${requiredFields.join(', ')} and no password field. Missing: ${missingFields.join(', ')}${hasPassword ? ', has password field' : ''}`,
        pass: false,
      };
    }
  },

  toHaveValidAccountStructure(received) {
    const requiredFields = ['id', 'account_number', 'server', 'account_type', 'status', 'balance', 'equity', 'created_at'];
    const missingFields = requiredFields.filter(field => !(field in received));
    
    if (missingFields.length === 0) {
      return {
        message: () => `expected account object to be invalid`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected account object to have all required fields ${requiredFields.join(', ')}. Missing: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  }
});

module.exports = {};