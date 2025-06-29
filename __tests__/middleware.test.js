const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Import setup FIRST - this sets up the Redis mock
require('./setup');

describe('Middleware and Helper Functions', () => {
  let redisClient;

  beforeAll(async () => {
    // Get Redis client for manual operations
    redisClient = testHelpers.getRedisClient();
    
    // Wait for initialization
    await testHelpers.wait(200);
  });

  beforeEach(async () => {
    // Clear Redis data before each test
    await testHelpers.clearRedisData(redisClient);
  });

  afterAll(async () => {
    // Clean up Redis connection
    if (redisClient && redisClient.quit) {
      await redisClient.quit();
    }
  });

  describe('Password Hashing', () => {
    test('should hash passwords correctly', async () => {
      const password = 'testpassword123';
      const hashedPassword = await bcrypt.hash(password, 12);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    test('should verify passwords correctly', async () => {
      const password = 'testpassword123';
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const isValid = await bcrypt.compare(password, hashedPassword);
      const isInvalid = await bcrypt.compare('wrongpassword', hashedPassword);
      
      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    test('should handle empty passwords', async () => {
      const password = '';
      const hashedPassword = await bcrypt.hash(password, 12);
      
      expect(hashedPassword).toBeDefined();
      
      const isValid = await bcrypt.compare('', hashedPassword);
      expect(isValid).toBe(true);
    });

    test('should generate different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = await bcrypt.hash(password, 12);
      const hash2 = await bcrypt.hash(password, 12);
      
      expect(hash1).not.toBe(hash2);
      
      // But both should verify correctly
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });
  });

  describe('UUID Generation', () => {
    test('should generate valid UUIDs', () => {
      const uuid1 = uuidv4();
      const uuid2 = uuidv4();
      
      expect(uuid1).toBeDefined();
      expect(uuid2).toBeDefined();
      expect(uuid1).not.toBe(uuid2);
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid1).toMatch(uuidRegex);
      expect(uuid2).toMatch(uuidRegex);
    });

    test('should generate unique UUIDs', () => {
      const uuids = new Set();
      const numUuids = 1000;
      
      for (let i = 0; i < numUuids; i++) {
        uuids.add(uuidv4());
      }
      
      expect(uuids.size).toBe(numUuids);
    });

    test('should validate UUID format with custom matcher', () => {
      const validUuid = uuidv4();
      const invalidUuids = [
        '123-456-789',
        'not-a-uuid',
        '12345678-1234-1234-1234-123456789012', // Wrong version
        '', // Empty string
        null, // Null
        undefined // Undefined
      ];

      expect(validUuid).toBeValidUUID();
      
      invalidUuids.forEach(invalidUuid => {
        if (invalidUuid !== null && invalidUuid !== undefined) {
          expect(invalidUuid).not.toBeValidUUID();
        }
      });
    });
  });

  describe('Redis Operations', () => {
    test('should store and retrieve data from Redis', async () => {
      const testData = { test: 'data', number: 123, boolean: true };
      
      await redisClient.set('test_key', JSON.stringify(testData));
      const retrieved = await redisClient.get('test_key');
      
      expect(JSON.parse(retrieved)).toEqual(testData);
    });

    test('should handle non-existent keys', async () => {
      const result = await redisClient.get('non_existent_key');
      expect(result).toBeNull();
    });

    test('should set expiration correctly', async () => {
      const testData = 'expiring_data';
      
      await redisClient.setEx('expiring_key', 1, testData);
      
      const immediate = await redisClient.get('expiring_key');
      expect(immediate).toBe(testData);
      
      // Wait for expiration (redis-mock should handle this)
      await testHelpers.wait(1100);
      
      const afterExpiry = await redisClient.get('expiring_key');
      expect(afterExpiry).toBeNull();
    });

    test('should delete keys correctly', async () => {
      await redisClient.set('delete_me', 'data');
      
      const beforeDelete = await redisClient.get('delete_me');
      expect(beforeDelete).toBe('data');
      
      await redisClient.del('delete_me');
      
      const afterDelete = await redisClient.get('delete_me');
      expect(afterDelete).toBeNull();
    });

    test('should handle complex data structures', async () => {
      const complexData = {
        users: [
          { id: 1, name: 'User 1', active: true },
          { id: 2, name: 'User 2', active: false }
        ],
        metadata: {
          version: '1.0',
          created: new Date().toISOString()
        },
        settings: {
          theme: 'dark',
          notifications: true
        }
      };

      await redisClient.set('complex_data', JSON.stringify(complexData));
      const retrieved = await redisClient.get('complex_data');
      
      expect(JSON.parse(retrieved)).toEqual(complexData);
    });

    test('should handle concurrent operations', async () => {
      const promises = [];
      const numOperations = 50;

      // Concurrent writes
      for (let i = 0; i < numOperations; i++) {
        promises.push(
          redisClient.set(`concurrent_key_${i}`, `value_${i}`)
        );
      }

      await Promise.all(promises);

      // Verify all values were set correctly
      const readPromises = [];
      for (let i = 0; i < numOperations; i++) {
        readPromises.push(redisClient.get(`concurrent_key_${i}`));
      }

      const results = await Promise.all(readPromises);
      
      results.forEach((value, index) => {
        expect(value).toBe(`value_${index}`);
      });
    });
  });

  describe('Session Management', () => {
    test('should create valid session data structure', () => {
      const sessionData = {
        user_id: uuidv4(),
        username: 'testuser',
        role: 'trader',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      expect(sessionData.user_id).toBeValidUUID();
      expect(sessionData.username).toBe('testuser');
      expect(sessionData.role).toBe('trader');
      expect(sessionData.created_at).toBeValidISO8601Date();
      expect(sessionData.expires_at).toBeValidISO8601Date();
      expect(new Date(sessionData.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    test('should detect expired sessions', () => {
      const expiredSession = {
        user_id: uuidv4(),
        username: 'testuser',
        role: 'trader',
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        expires_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1 hour ago
      };

      const isExpired = new Date() > new Date(expiredSession.expires_at);
      expect(isExpired).toBe(true);
    });

    test('should detect valid sessions', () => {
      const validSession = {
        user_id: uuidv4(),
        username: 'testuser',
        role: 'trader',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const isExpired = new Date() > new Date(validSession.expires_at);
      expect(isExpired).toBe(false);
    });

    test('should store and retrieve session data from Redis', async () => {
      const sessionId = uuidv4();
      const sessionData = {
        user_id: uuidv4(),
        username: 'sessiontest',
        role: 'manager',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      // Store session
      await redisClient.setEx(`session:${sessionId}`, 86400, JSON.stringify(sessionData));
      
      // Retrieve session
      const retrievedData = await redisClient.get(`session:${sessionId}`);
      const parsedSession = JSON.parse(retrievedData);
      
      expect(parsedSession).toEqual(sessionData);
      expect(parsedSession.user_id).toBeValidUUID();
      expect(parsedSession.username).toBe('sessiontest');
    });
  });

  describe('Data Validation', () => {
    test('should validate user roles', () => {
      const validRoles = ['admin', 'manager', 'trader', 'viewer'];
      const invalidRoles = ['superuser', 'guest', 'root', '', null, undefined];

      validRoles.forEach(role => {
        expect(validRoles.includes(role)).toBe(true);
      });

      invalidRoles.forEach(role => {
        expect(validRoles.includes(role)).toBe(false);
      });
    });

    test('should validate account types', () => {
      const validTypes = ['FTMO', 'Forex'];
      const invalidTypes = ['Demo', 'Live', 'Paper', '', null, undefined];

      validTypes.forEach(type => {
        expect(validTypes.includes(type)).toBe(true);
      });

      invalidTypes.forEach(type => {
        expect(validTypes.includes(type)).toBe(false);
      });
    });

    test('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test123@test.org',
        'user+tag@domain.com',
        'first.last@subdomain.example.com'
      ];

      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'test@',
        'test.com',
        '',
        'spaces in@email.com',
        'test@domain',
        'test..test@domain.com'
      ];

      validEmails.forEach(email => {
        expect(email).toBeValidEmail();
      });

      invalidEmails.forEach(email => {
        expect(email).not.toBeValidEmail();
      });
    });

    test('should validate required fields', () => {
      const requiredUserFields = ['username', 'email', 'password', 'firstName', 'lastName'];
      const requiredAccountFields = ['account_number', 'password', 'server', 'account_type'];

      const validUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      };

      const invalidUser = {
        username: 'testuser',
        email: 'test@example.com'
        // missing password, firstName, lastName
      };

      const hasAllUserFields = requiredUserFields.every(field => validUser[field]);
      const missingUserFields = requiredUserFields.some(field => !invalidUser[field]);

      expect(hasAllUserFields).toBe(true);
      expect(missingUserFields).toBe(true);

      const validAccount = {
        account_number: '12345678',
        password: 'password',
        server: 'MT5-Server',
        account_type: 'Forex'
      };

      const hasAllAccountFields = requiredAccountFields.every(field => validAccount[field]);
      expect(hasAllAccountFields).toBe(true);
    });

    test('should validate data types', () => {
      const testValidations = [
        { value: 'string', type: 'string', expected: true },
        { value: 123, type: 'number', expected: true },
        { value: true, type: 'boolean', expected: true },
        { value: [], type: 'array', expected: true },
        { value: {}, type: 'object', expected: true },
        { value: null, type: 'null', expected: true },
        { value: undefined, type: 'undefined', expected: true }
      ];

      testValidations.forEach(({ value, type, expected }) => {
        let result = false;
        
        switch (type) {
          case 'string':
            result = typeof value === 'string';
            break;
          case 'number':
            result = typeof value === 'number';
            break;
          case 'boolean':
            result = typeof value === 'boolean';
            break;
          case 'array':
            result = Array.isArray(value);
            break;
          case 'object':
            result = typeof value === 'object' && value !== null && !Array.isArray(value);
            break;
          case 'null':
            result = value === null;
            break;
          case 'undefined':
            result = value === undefined;
            break;
        }
        
        expect(result).toBe(expected);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle JSON parsing errors', () => {
      const invalidJsonStrings = [
        '{"invalid": json}',
        '{missing: "quotes"}',
        '{"unclosed": "string}',
        '{trailing: "comma",}',
        ''
      ];
      
      invalidJsonStrings.forEach(invalidJson => {
        expect(() => {
          JSON.parse(invalidJson);
        }).toThrow();

        // Safe JSON parsing
        let result;
        try {
          result = JSON.parse(invalidJson);
        } catch (error) {
          result = null;
        }

        expect(result).toBeNull();
      });
    });

    test('should handle undefined/null values', () => {
      const testValues = [undefined, null, '', 0, false, NaN];

      testValues.forEach(value => {
        const isPresent = Boolean(value);
        // Only truthy values should pass
        expect(isPresent).toBe(false);
        
        // Test safe property access
        const safeAccess = value?.property || 'default';
        expect(safeAccess).toBe('default');
      });
    });

    test('should sanitize user input', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'DROP TABLE users;',
        '../../../etc/passwd',
        '${jndi:ldap://malicious.com}',
        '"><script>alert(1)</script>',
        'javascript:alert(1)'
      ];

      maliciousInputs.forEach(input => {
        // Simple sanitization - in real app, use proper sanitization library
        const sanitized = input.replace(/[<>]/g, '').replace(/javascript:/gi, '');
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized.toLowerCase()).not.toContain('javascript:');
      });
    });

    test('should handle async errors gracefully', async () => {
      const asyncOperations = [
        () => redisClient.get('nonexistent_key'),
        () => Promise.reject(new Error('Test error')),
        () => new Promise((resolve) => setTimeout(() => resolve('success'), 10))
      ];

      for (const operation of asyncOperations) {
        try {
          const result = await operation();
          // Operation succeeded
          expect(result !== undefined).toBe(true);
        } catch (error) {
          // Operation failed, but we handled it gracefully
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Performance and Limits', () => {
    test('should handle reasonable input sizes', () => {
      const sizes = [
        { name: 'small', size: 100 },
        { name: 'medium', size: 1000 },
        { name: 'large', size: 10000 }
      ];

      sizes.forEach(({ name, size }) => {
        const testString = 'a'.repeat(size);
        
        expect(testString.length).toBe(size);
        
        // Test if we can handle these sizes
        expect(() => JSON.stringify({ data: testString })).not.toThrow();
        
        // Test memory usage is reasonable
        const startMemory = process.memoryUsage().heapUsed;
        const processedString = testString.toUpperCase();
        const endMemory = process.memoryUsage().heapUsed;
        
        expect(processedString.length).toBe(size);
        
        // Memory increase should be reasonable (not more than 10MB for these tests)
        const memoryIncrease = endMemory - startMemory;
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      });
    });

    test('should handle concurrent operations efficiently', async () => {
      const numOperations = 50;
      const startTime = Date.now();

      const promises = [];
      for (let i = 0; i < numOperations; i++) {
        promises.push(
          redisClient.set(`perf_key_${i}`, `value_${i}`)
        );
      }

      await Promise.all(promises);

      // Verify operations completed
      const verifyPromises = [];
      for (let i = 0; i < numOperations; i++) {
        verifyPromises.push(
          redisClient.get(`perf_key_${i}`)
        );
      }

      const results = await Promise.all(verifyPromises);
      const totalTime = Date.now() - startTime;

      // All operations should complete
      expect(results.length).toBe(numOperations);
      results.forEach((value, index) => {
        expect(value).toBe(`value_${index}`);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(2000); // 2 seconds for 100 operations
    });

    test('should handle memory cleanup', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create and clean up data
      const tempData = [];
      for (let i = 0; i < 1000; i++) {
        tempData.push({
          id: uuidv4(),
          data: 'x'.repeat(1000)
        });
      }
      
      // Clear reference
      tempData.length = 0;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Small delay to allow cleanup
      await testHelpers.wait(100);
      
      const finalMemory = process.memoryUsage();
      
      // Memory should not increase dramatically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB limit
    });
  });

  describe('Helper Function Testing', () => {
    test('should test generateTestUser helper', () => {
      const user1 = testHelpers.generateTestUser();
      const user2 = testHelpers.generateTestUser({ role: 'admin' });
      
      expect(user1.username).toBeDefined();
      expect(user1.email).toBeValidEmail();
      expect(user1.role).toBe('trader'); // default
      
      expect(user2.role).toBe('admin'); // overridden
      expect(user1.username).not.toBe(user2.username); // should be unique
    });

    test('should test generateTestAccount helper', () => {
      const account1 = testHelpers.generateTestAccount();
      const account2 = testHelpers.generateTestAccount({ account_type: 'FTMO' });
      
      expect(account1.account_number).toBeDefined();
      expect(account1.server).toBe('TestServer-MT5');
      expect(account1.account_type).toBe('Forex'); // default
      
      expect(account2.account_type).toBe('FTMO'); // overridden
      expect(account1.account_number).not.toBe(account2.account_number); // should be unique
    });

    test('should test custom matchers', () => {
      const validUser = {
        id: uuidv4(),
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'trader',
        status: 'active',
        created_at: new Date().toISOString()
      };

      const validAccount = {
        id: uuidv4(),
        account_number: '12345678',
        server: 'TestServer',
        account_type: 'Forex',
        status: 'active',
        balance: 0,
        equity: 0,
        created_at: new Date().toISOString()
      };

      expect(validUser).toHaveValidUserStructure();
      expect(validAccount).toHaveValidAccountStructure();
    });
  });
});