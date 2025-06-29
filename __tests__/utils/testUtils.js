const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

/**
 * Test Utilities for MT5 Trading Platform
 * Provides helper functions, mock data generators, and testing utilities
 */

class TestUtils {
  constructor() {
    this.counters = {
      user: 0,
      account: 0,
      session: 0
    };
  }

  /**
   * Generate mock user data
   */
  generateUser(overrides = {}) {
    this.counters.user++;
    const baseUser = {
      id: uuidv4(),
      username: `testuser_${this.counters.user}_${Date.now()}`,
      email: `testuser_${this.counters.user}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: `User${this.counters.user}`,
      role: 'trader',
      status: 'active',
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      ...overrides
    };

    return baseUser;
  }

  /**
   * Generate multiple users with different roles
   */
  generateUsers(count = 5, options = {}) {
    const users = [];
    const roles = ['admin', 'manager', 'trader', 'viewer'];

    for (let i = 0; i < count; i++) {
      const role = roles[i % roles.length];
      users.push(this.generateUser({
        role,
        username: `${role}_user_${i}`,
        email: `${role}_user_${i}@example.com`,
        ...options
      }));
    }

    return users;
  }

  /**
   * Generate mock account data
   */
  generateAccount(overrides = {}) {
    this.counters.account++;
    const baseAccount = {
      id: uuidv4(),
      account_number: `${Math.floor(Math.random() * 900000000) + 100000000}`,
      password: `AccountPass${this.counters.account}!`,
      server: `TestServer${this.counters.account}-MT5`,
      account_type: Math.random() > 0.5 ? 'Forex' : 'FTMO',
      status: 'inactive',
      balance: Math.floor(Math.random() * 100000),
      equity: Math.floor(Math.random() * 100000),
      created_at: new Date().toISOString(),
      created_by: 'testuser',
      ...overrides
    };

    return baseAccount;
  }

  /**
   * Generate multiple accounts
   */
  generateAccounts(count = 5, options = {}) {
    const accounts = [];
    const types = ['Forex', 'FTMO'];
    const statuses = ['active', 'inactive'];

    for (let i = 0; i < count; i++) {
      accounts.push(this.generateAccount({
        account_type: types[i % types.length],
        status: statuses[i % statuses.length],
        account_number: `${100000000 + i}`,
        ...options
      }));
    }

    return accounts;
  }

  /**
   * Generate session data
   */
  generateSession(user, options = {}) {
    this.counters.session++;
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const sessionData = {
      user_id: user.id,
      username: user.username,
      role: user.role,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      ...options
    };

    return {
      sessionId,
      sessionData
    };
  }

  /**
   * Generate expired session
   */
  generateExpiredSession(user) {
    return this.generateSession(user, {
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    });
  }

  /**
   * Hash password for testing
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, 12);
  }

  /**
   * Generate test data sets for performance testing
   */
  generateLargeDataset(type = 'users', count = 1000) {
    const dataset = [];
    
    for (let i = 0; i < count; i++) {
      if (type === 'users') {
        dataset.push(this.generateUser({
          username: `bulk_user_${i}`,
          email: `bulk_user_${i}@example.com`
        }));
      } else if (type === 'accounts') {
        dataset.push(this.generateAccount({
          account_number: `${200000000 + i}`
        }));
      }
    }

    return dataset;
  }

  /**
   * Generate malicious payloads for security testing
   */
  getMaliciousPayloads() {
    return {
      xss: [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert("xss")>',
        'javascript:alert("xss")',
        '<svg onload=alert("xss")>',
        '"><script>alert("xss")</script>',
        '\';alert("xss");//',
        '<iframe src="javascript:alert(\'xss\')"></iframe>',
        '&lt;script&gt;alert("xss")&lt;/script&gt;'
      ],
      
      sqlInjection: [
        '\' OR \'1\'=\'1',
        '\'; DROP TABLE users; --',
        '\' UNION SELECT * FROM users --',
        '1\' OR \'1\'=\'1\' --',
        '\'; INSERT INTO users (username) VALUES (\'hacked\'); --',
        'admin\' --',
        'admin\' #',
        'admin\'/*'
      ],
      
      noSqlInjection: [
        { $ne: null },
        { $regex: '.*' },
        { $where: 'function() { return true; }' },
        '{"$ne": null}',
        '{"username": {"$regex": ".*"}}',
        { $gt: '' },
        { $exists: true }
      ],
      
      pathTraversal: [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
        '/etc/passwd',
        'C:\\windows\\system32\\drivers\\etc\\hosts',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ],
      
      commandInjection: [
        '; ls -la',
        '| cat /etc/passwd',
        '&& ping google.com',
        '`whoami`',
        '$(id)',
        '; rm -rf /',
        '| nc -l 4444'
      ],
      
      invalidIds: [
        'null',
        'undefined',
        'NaN',
        'Infinity',
        '-1',
        '0',
        '999999999',
        'admin',
        '../admin',
        'true',
        'false',
        '{id: 1}',
        '[1,2,3]'
      ]
    };
  }

  /**
   * Generate invalid data for validation testing
   */
  getInvalidData() {
    return {
      emails: [
        'plainaddress',
        '@missinglocalpart.com',
        'missing-domain@.com',
        'missing-tld@domain',
        'spaces in@email.com',
        'special<chars>@domain.com',
        '"quotes"@domain.com',
        'multiple@@domain.com',
        'toolong' + 'a'.repeat(255) + '@domain.com'
      ],
      
      usernames: [
        '',
        'a', // Too short
        'ab', // Too short
        'a'.repeat(255), // Too long
        'user name', // Spaces
        'user@name', // Special chars
        'user<script>',
        null,
        undefined,
        123,
        true
      ],
      
      passwords: [
        '',
        '123', // Too short
        'password', // Too weak
        'PASSWORD', // No lowercase
        'password123', // No uppercase
        'Password', // No numbers
        'a'.repeat(1000) // Too long
      ],
      
      accountNumbers: [
        '',
        '123', // Too short
        'abcdefgh', // Non-numeric
        '1234567890123456', // Too long
        null,
        undefined,
        true,
        {}
      ],
      
      roles: [
        'superuser',
        'guest',
        'root',
        'user',
        '',
        null,
        undefined,
        123,
        true,
        {}
      ],
      
      accountTypes: [
        'Demo',
        'Live',
        'Paper',
        'Test',
        '',
        null,
        undefined,
        123,
        true,
        {}
      ]
    };
  }

  /**
   * Wait for a specified duration
   */
  async wait(ms = 100) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate random string
   */
  randomString(length = 10, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  /**
   * Generate random number in range
   */
  randomNumber(min = 0, max = 100) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random boolean
   */
  randomBoolean() {
    return Math.random() > 0.5;
  }

  /**
   * Generate random date
   */
  randomDate(start = new Date(2020, 0, 1), end = new Date()) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }

  /**
   * Create test database state
   */
  async createTestState(redisClient, options = {}) {
    const {
      userCount = 5,
      accountCount = 10,
      createSessions = true
    } = options;

    const users = this.generateUsers(userCount);
    const accounts = this.generateAccounts(accountCount);
    const sessions = [];

    // Hash passwords
    for (const user of users) {
      user.password = await this.hashPassword(user.password);
    }

    // Create sessions for users
    if (createSessions) {
      for (const user of users) {
        const { sessionId, sessionData } = this.generateSession(user);
        sessions.push({ sessionId, sessionData, user });
        await redisClient.setEx(`session:${sessionId}`, 86400, JSON.stringify(sessionData));
      }
    }

    // Store in Redis
    await redisClient.set('platform_users', JSON.stringify(users));
    await redisClient.set('mt5_accounts', JSON.stringify(accounts));

    return {
      users,
      accounts,
      sessions
    };
  }

  /**
   * Clean up test data
   */
  async cleanupTestState(redisClient) {
    await redisClient.del('platform_users');
    await redisClient.del('mt5_accounts');
    
    // Clean up sessions
    const sessionKeys = await redisClient.keys('session:*');
    if (sessionKeys.length > 0) {
      await redisClient.del(sessionKeys);
    }

    // Clean up any test keys
    const testKeys = await redisClient.keys('test_*');
    if (testKeys.length > 0) {
      await redisClient.del(testKeys);
    }
  }

  /**
   * Validate response structure
   */
  validateResponseStructure(response, expectedStructure) {
    const errors = [];

    function validate(obj, structure, path = '') {
      for (const [key, expectedType] of Object.entries(structure)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj)) {
          errors.push(`Missing property: ${currentPath}`);
          continue;
        }

        const actualType = typeof obj[key];
        if (actualType !== expectedType && expectedType !== 'any') {
          errors.push(`Wrong type for ${currentPath}: expected ${expectedType}, got ${actualType}`);
        }
      }
    }

    validate(response, expectedStructure);
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Performance timer
   */
  createTimer() {
    const start = process.hrtime.bigint();
    
    return {
      elapsed: () => {
        const end = process.hrtime.bigint();
        return Number(end - start) / 1000000; // Convert to milliseconds
      }
    };
  }

  /**
   * Memory usage tracker
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss / 1024 / 1024, // MB
      heapTotal: usage.heapTotal / 1024 / 1024, // MB
      heapUsed: usage.heapUsed / 1024 / 1024, // MB
      external: usage.external / 1024 / 1024 // MB
    };
  }

  /**
   * Reset counters
   */
  resetCounters() {
    this.counters = {
      user: 0,
      account: 0,
      session: 0
    };
  }

  /**
   * Generate test report data
   */
  generateTestReport(testResults) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: testResults.numTotalTests || 0,
        passed: testResults.numPassedTests || 0,
        failed: testResults.numFailedTests || 0,
        skipped: testResults.numPendingTests || 0,
        duration: testResults.testExecError ? 0 : (testResults.perfStats?.end - testResults.perfStats?.start) || 0
      },
      suites: testResults.testResults?.map(suite => ({
        name: suite.testFilePath,
        tests: suite.numPassingTests + suite.numFailingTests,
        passed: suite.numPassingTests,
        failed: suite.numFailingTests,
        skipped: suite.numPendingTests,
        duration: suite.perfStats?.end - suite.perfStats?.start
      })) || [],
      coverage: testResults.coverageMap ? {
        statements: testResults.coverageMap.getCoverageSummary?.().statements || {},
        branches: testResults.coverageMap.getCoverageSummary?.().branches || {},
        functions: testResults.coverageMap.getCoverageSummary?.().functions || {},
        lines: testResults.coverageMap.getCoverageSummary?.().lines || {}
      } : null
    };

    return report;
  }
}

// Singleton instance
const testUtils = new TestUtils();

module.exports = testUtils;