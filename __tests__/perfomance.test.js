const request = require('supertest');

// Import setup FIRST - this sets up the Redis mock
require('./setup');

// Import app AFTER setup
const app = require('../server');

describe('Performance Tests', () => {
  let redisClient;
  let authToken;
  let managerToken;

  beforeAll(async () => {
    // Get Redis client for manual operations
    redisClient = testHelpers.getRedisClient();
    
    // Wait for initialization
    await testHelpers.wait(200);
  });

  beforeEach(async () => {
    // Clear Redis data before each test
    await testHelpers.clearRedisData(redisClient);
    
    // Create authenticated users for testing
    const { token: aToken } = await testHelpers.createAuthenticatedUser(app, 'admin', redisClient);
    authToken = aToken;

    const { token: mToken } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
    managerToken = mToken;
  });

  afterAll(async () => {
    // Clean up Redis connection
    if (redisClient && redisClient.quit) {
      await redisClient.quit();
    }
  });

  describe('Response Time Tests', () => {
    test('Authentication endpoints should respond within 500ms', async () => {
      const userData = testHelpers.generateTestUser();

      const startTime = Date.now();

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500);
    });

    test('Account listing should respond within 200ms', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(200);
    });

    test('User listing should respond within 300ms', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(300);
    });

    test('Health check should respond within 100ms', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100);
    });
  });

  describe('Concurrent Request Handling', () => {
    test('Should handle 10 concurrent authentication requests', async () => {
      const promises = [];
      const numRequests = 10;

      for (let i = 0; i < numRequests; i++) {
        const userData = testHelpers.generateTestUser({
          username: `concurrent_auth_${i}_${Date.now()}`,
          email: `concurrent_auth_${i}_${Date.now()}@test.com`
        });

        promises.push(
          request(app)
            .post('/api/auth/register')
            .send(userData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 10 requests

      // Most requests should succeed
      const successfulRequests = responses.filter(r => r.status === 201);
      expect(successfulRequests.length).toBeGreaterThan(numRequests * 0.8); // At least 80% success rate
    });

    test('Should handle 20 concurrent account creation requests', async () => {
      const promises = [];
      const numRequests = 20;

      for (let i = 0; i < numRequests; i++) {
        const accountData = testHelpers.generateTestAccount({
          account_number: `${Date.now()}_${i}`,
        });

        promises.push(
          request(app)
            .post('/api/accounts')
            .set('Authorization', `Bearer ${managerToken}`)
            .send(accountData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(10000); // 10 seconds for 20 requests

      // Count successful creations
      const successfulRequests = responses.filter(r => r.status === 201);
      expect(successfulRequests.length).toBeGreaterThan(0);

      // Clean up created accounts
      for (const response of successfulRequests) {
        await request(app)
          .delete(`/api/accounts/${response.body.account.id}`)
          .set('Authorization', `Bearer ${managerToken}`);
      }
    });

    test('Should handle mixed concurrent operations', async () => {
      const promises = [];

      // Mix of different operations
      for (let i = 0; i < 5; i++) {
        // Health checks
        promises.push(
          request(app).get('/api/health')
        );

        // Account listings
        promises.push(
          request(app)
            .get('/api/accounts')
            .set('Authorization', `Bearer ${authToken}`)
        );

        // User listings (admin only)
        promises.push(
          request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${authToken}`)
        );

        // Session verifications
        promises.push(
          request(app)
            .get('/api/auth/verify')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(3000); // 3 seconds for mixed operations

      // Most requests should succeed
      const successfulRequests = responses.filter(r => r.status === 200);
      expect(successfulRequests.length).toBeGreaterThan(promises.length * 0.9);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('Should not leak memory during repeated operations', async () => {
      const initialMemory = process.memoryUsage();

      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/health')
          .expect(200);

        await request(app)
          .get('/api/accounts')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();

      // Memory should not increase dramatically (allow for 50MB increase)
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    test('Should handle large request bodies efficiently', async () => {
      const largeString = 'a'.repeat(1000); // 1KB string

      const userData = testHelpers.generateTestUser({
        username: 'large_data_user',
        firstName: largeString,
        lastName: largeString
      });

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      const responseTime = Date.now() - startTime;

      // Should still respond quickly even with larger data
      expect(responseTime).toBeLessThan(1000);
      expect([201, 400]).toContain(response.status); // Either success or validation error
    });
  });

  describe('Database Performance', () => {
    test('Should handle multiple Redis operations efficiently', async () => {
      const operations = [];
      const numOperations = 100;

      const startTime = Date.now();

      // Perform multiple Redis operations
      for (let i = 0; i < numOperations; i++) {
        operations.push(
          redisClient.set(`perf_test_${i}`, JSON.stringify({ data: `test_${i}` }))
        );
      }

      await Promise.all(operations);

      // Read operations
      const readOperations = [];
      for (let i = 0; i < numOperations; i++) {
        readOperations.push(
          redisClient.get(`perf_test_${i}`)
        );
      }

      const results = await Promise.all(readOperations);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(2000); // 2 seconds for 200 operations
      expect(results.length).toBe(numOperations);

      // Clean up
      const deleteOperations = [];
      for (let i = 0; i < numOperations; i++) {
        deleteOperations.push(
          redisClient.del(`perf_test_${i}`)
        );
      }
      await Promise.all(deleteOperations);
    });

    test('Should efficiently handle large datasets', async () => {
      // Create a large dataset of users
      const largeUserSet = [];
      for (let i = 0; i < 100; i++) {
        largeUserSet.push(testHelpers.generateTestUser({
          username: `bulk_user_${i}`,
          email: `bulk_user_${i}@test.com`
        }));
      }

      const startTime = Date.now();

      // Store large dataset
      await redisClient.set('large_user_dataset', JSON.stringify(largeUserSet));

      // Retrieve and parse
      const retrievedData = await redisClient.get('large_user_dataset');
      const parsedData = JSON.parse(retrievedData);

      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(500); // Should be very fast
      expect(parsedData.length).toBe(100);
      expect(parsedData[0].username).toBe('bulk_user_0');

      // Clean up
      await redisClient.del('large_user_dataset');
    });
  });

  describe('Scalability Tests', () => {
    test('Should maintain performance with increasing user count', async () => {
      const userCounts = [10, 50, 100];
      const responseTimes = [];

      for (const userCount of userCounts) {
        // Create users
        const users = [];
        for (let i = 0; i < userCount; i++) {
          users.push(testHelpers.generateTestUser({
            username: `scale_user_${userCount}_${i}`,
            email: `scale_user_${userCount}_${i}@test.com`
          }));
        }

        await redisClient.set(`scale_test_users_${userCount}`, JSON.stringify(users));

        // Measure response time for user listing
        const startTime = Date.now();

        await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);

        // Clean up
        await redisClient.del(`scale_test_users_${userCount}`);
      }

      // Response time should not increase dramatically
      expect(responseTimes[0]).toBeLessThan(300);
      expect(responseTimes[1]).toBeLessThan(500);
      expect(responseTimes[2]).toBeLessThan(800);

      // Linear growth is acceptable, exponential is not
      const growthRatio = responseTimes[2] / responseTimes[0];
      expect(growthRatio).toBeLessThan(5); // No more than 5x slower
    });

    test('Should handle burst traffic patterns', async () => {
      const burstSizes = [5, 15, 25];
      
      for (const burstSize of burstSizes) {
        const promises = [];

        const startTime = Date.now();

        // Create burst of requests
        for (let i = 0; i < burstSize; i++) {
          promises.push(
            request(app)
              .get('/api/health')
              .expect(200)
          );
        }

        const responses = await Promise.all(promises);
        const totalTime = Date.now() - startTime;

        // All requests should complete
        expect(responses.length).toBe(burstSize);

        // Time should scale reasonably
        const timePerRequest = totalTime / burstSize;
        expect(timePerRequest).toBeLessThan(100); // Less than 100ms per request on average
      }
    });
  });

  describe('Resource Cleanup', () => {
    test('Should properly clean up sessions', async () => {
      // Create multiple sessions
      const sessionTokens = [];
      for (let i = 0; i < 10; i++) {
        const userData = testHelpers.generateTestUser({
          username: `cleanup_user_${i}_${Date.now()}`,
          email: `cleanup_user_${i}_${Date.now()}@test.com`
        });

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData);

        if (response.status === 201) {
          sessionTokens.push(response.body.session_id);
        }
      }

      // Verify sessions exist
      const sessionKeys = await redisClient.keys('session:*');
      expect(sessionKeys.length).toBeGreaterThan(0);

      // Logout all sessions
      for (const token of sessionTokens) {
        await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`);
      }

      // Verify cleanup (some sessions might remain from other tests)
      const remainingSessions = await redisClient.keys('session:*');
      expect(remainingSessions.length).toBeLessThan(sessionKeys.length);
    });
  });
});

describe('Load Testing Simulation', () => {
  let redisClient;

  beforeAll(async () => {
    redisClient = testHelpers.getRedisClient();
    await testHelpers.wait(200);
  });

  beforeEach(async () => {
    await testHelpers.clearRedisData(redisClient);
  });

  afterAll(async () => {
    if (redisClient && redisClient.quit) {
      await redisClient.quit();
    }
  });

  test('Should handle realistic load patterns', async () => {
    // Simulate realistic usage pattern
    const operations = [];

    // 60% read operations, 30% auth operations, 10% write operations
    for (let i = 0; i < 100; i++) {
      const rand = Math.random();

      if (rand < 0.6) {
        // Read operations
        operations.push({
          type: 'read',
          operation: () => request(app).get('/api/health')
        });
      } else if (rand < 0.9) {
        // Auth operations
        operations.push({
          type: 'auth',
          operation: () => request(app).get('/api/auth/verify').set('Authorization', `Bearer invalid`)
        });
      } else {
        // Write operations (will mostly fail due to permissions, but that's realistic)
        operations.push({
          type: 'write',
          operation: () => request(app).post('/api/accounts').send({})
        });
      }
    }

    const startTime = Date.now();

    // Execute operations in batches to simulate real traffic
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchPromises = batch.map(op => op.operation());
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to simulate realistic traffic
      await testHelpers.wait(10);
    }

    const totalTime = Date.now() - startTime;

    // Should complete within reasonable time
    expect(totalTime).toBeLessThan(15000); // 15 seconds for 100 operations

    // Most operations should complete (even if they return errors)
    expect(results.length).toBe(operations.length);

    // Should not have any 5xx errors (server errors)
    const serverErrors = results.filter(r => r.status >= 500);
    expect(serverErrors.length).toBe(0);
  });
});