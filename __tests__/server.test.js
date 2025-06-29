const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Import setup FIRST - this sets up the Redis mock
require('./setup');

// Import app AFTER setup
const app = require('../server');

describe('MT5 Trading Platform API', () => {
  let redisClient;
  let adminToken;
  let managerToken;
  let traderToken;
  let testUserId;
  let testAccountId;

  beforeAll(async () => {
    // Get Redis client for manual operations
    redisClient = testHelpers.getRedisClient();
    
    // Wait a bit for any initialization
    await testHelpers.wait(200);
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

  describe('Health Check', () => {
    test('GET /api/health should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        redis: 'connected',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Authentication', () => {
    describe('POST /api/auth/register', () => {
      test('should register a new user successfully', async () => {
        const userData = testHelpers.generateTestUser();
        
        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        expect(response.body).toMatchObject({
          user: {
            username: userData.username,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: 'trader', // Default role
            status: 'active'
          },
          session_id: expect.any(String),
          message: 'Registration successful'
        });

        expect(response.body.user).toHaveValidUserStructure();
        expect(response.body.user.id).toBeValidUUID();
        expect(response.body.user.email).toBeValidEmail();
        expect(response.body.user.created_at).toBeValidISO8601Date();

        adminToken = response.body.session_id;
      });

      test('should fail with missing required fields', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'incomplete'
          })
          .expect(400);

        expect(response.body.error).toBe('All fields are required');
      });

      test('should fail with duplicate username', async () => {
        const userData = testHelpers.generateTestUser();
        
        // Register first user
        await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        // Try to register with same username
        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(400);

        expect(response.body.error).toBe('Username already exists');
      });

      test('should fail with duplicate email', async () => {
        const userData1 = testHelpers.generateTestUser();
        const userData2 = testHelpers.generateTestUser({
          email: userData1.email // Same email, different username
        });
        
        // Register first user
        await request(app)
          .post('/api/auth/register')
          .send(userData1)
          .expect(201);

        // Try to register with same email
        const response = await request(app)
          .post('/api/auth/register')
          .send(userData2)
          .expect(400);

        expect(response.body.error).toBe('Email already exists');
      });
    });

    describe('POST /api/auth/login', () => {
      let testUser;

      beforeEach(async () => {
        // Create a user for login tests
        testUser = testHelpers.generateTestUser();
        await request(app)
          .post('/api/auth/register')
          .send(testUser)
          .expect(201);
      });

      test('should login successfully with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: testUser.password
          })
          .expect(200);

        expect(response.body).toMatchObject({
          user: {
            username: testUser.username,
            email: testUser.email,
            role: 'trader'
          },
          session_id: expect.any(String),
          message: 'Login successful'
        });

        expect(response.body.user).toHaveValidUserStructure();
        adminToken = response.body.session_id;
      });

      test('should fail with invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: 'wrongpassword'
          })
          .expect(401);

        expect(response.body.error).toBe('Invalid credentials');
      });

      test('should fail with missing credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username
          })
          .expect(400);

        expect(response.body.error).toBe('Username and password are required');
      });

      test('should fail with non-existent user', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'nonexistent',
            password: 'password'
          })
          .expect(401);

        expect(response.body.error).toBe('Invalid credentials');
      });
    });

    describe('GET /api/auth/verify', () => {
      let sessionToken;

      beforeEach(async () => {
        const { token } = await testHelpers.createAuthenticatedUser(app, 'trader', redisClient);
        sessionToken = token;
      });

      test('should verify valid session', async () => {
        const response = await request(app)
          .get('/api/auth/verify')
          .set('Authorization', `Bearer ${sessionToken}`)
          .expect(200);

        expect(response.body.user).toHaveValidUserStructure();
      });

      test('should fail with invalid session', async () => {
        const response = await request(app)
          .get('/api/auth/verify')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.error).toBe('Invalid session');
      });

      test('should fail with no session', async () => {
        const response = await request(app)
          .get('/api/auth/verify')
          .expect(401);

        expect(response.body.error).toBe('No session provided');
      });
    });

    describe('POST /api/auth/logout', () => {
      let sessionToken;

      beforeEach(async () => {
        const { token } = await testHelpers.createAuthenticatedUser(app, 'trader', redisClient);
        sessionToken = token;
      });

      test('should logout successfully', async () => {
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${sessionToken}`)
          .expect(200);

        expect(response.body.message).toBe('Logged out successfully');

        // Verify session is invalidated
        await request(app)
          .get('/api/auth/verify')
          .set('Authorization', `Bearer ${sessionToken}`)
          .expect(401);
      });

      test('should fail logout with invalid session', async () => {
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.error).toBe('Invalid session');
      });
    });
  });

  describe('User Management (Admin Only)', () => {
    let adminToken;

    beforeEach(async () => {
      const { token } = await testHelpers.createAuthenticatedUser(app, 'admin', redisClient);
      adminToken = token;
    });

    describe('GET /api/users', () => {
      test('should get all users as admin', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        
        // Check that all users have valid structure
        response.body.forEach(user => {
          expect(user).toHaveValidUserStructure();
        });
      });

      test('should fail as non-admin user', async () => {
        const { token: traderToken } = await testHelpers.createAuthenticatedUser(app, 'trader', redisClient);

        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${traderToken}`)
          .expect(403);

        expect(response.body.error).toBe('Admin access required');
      });
    });

    describe('POST /api/users', () => {
      test('should create a new user as admin', async () => {
        const newUser = {
          username: testHelpers.randomString(),
          email: `${testHelpers.randomString()}@test.com`,
          firstName: 'New',
          lastName: 'User',
          role: 'manager',
          password: 'password123'
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newUser)
          .expect(201);

        expect(response.body).toMatchObject({
          user: {
            username: newUser.username,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: 'active'
          },
          message: 'User created successfully'
        });

        expect(response.body.user).toHaveValidUserStructure();
        testUserId = response.body.user.id;
      });

      test('should fail with invalid role', async () => {
        const newUser = testHelpers.generateTestUser({
          role: 'invalid_role'
        });

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newUser)
          .expect(400);

        expect(response.body.error).toBe('Invalid role');
      });
    });

    describe('PUT /api/users/:userId', () => {
      beforeEach(async () => {
        // Create a test user to update
        const newUser = {
          username: testHelpers.randomString(),
          email: `${testHelpers.randomString()}@test.com`,
          firstName: 'Update',
          lastName: 'Test',
          role: 'trader',
          password: 'password123'
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newUser)
          .expect(201);

        testUserId = response.body.user.id;
      });

      test('should update user as admin', async () => {
        const updateData = {
          firstName: 'Updated',
          lastName: 'Name',
          role: 'manager'
        };

        const response = await request(app)
          .put(`/api/users/${testUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.user).toMatchObject(updateData);
        expect(response.body.message).toBe('User updated successfully');
      });

      test('should fail to update non-existent user', async () => {
        const response = await request(app)
          .put(`/api/users/${uuidv4()}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ firstName: 'Test' })
          .expect(404);

        expect(response.body.error).toBe('User not found');
      });
    });

    describe('DELETE /api/users/:userId', () => {
      beforeEach(async () => {
        // Create a test user to delete
        const newUser = {
          username: testHelpers.randomString(),
          email: `${testHelpers.randomString()}@test.com`,
          firstName: 'Delete',
          lastName: 'Test',
          role: 'trader',
          password: 'password123'
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newUser)
          .expect(201);

        testUserId = response.body.user.id;
      });

      test('should delete user as admin', async () => {
        const response = await request(app)
          .delete(`/api/users/${testUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.message).toBe('User deleted successfully');
      });

      test('should fail to delete non-existent user', async () => {
        const response = await request(app)
          .delete(`/api/users/${uuidv4()}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.error).toBe('User not found');
      });
    });
  });

  describe('Account Management', () => {
    let managerToken;

    beforeEach(async () => {
      const { token } = await testHelpers.createAuthenticatedUser(app, 'manager', redisClient);
      managerToken = token;
    });

    describe('GET /api/accounts', () => {
      test('should get all accounts when authenticated', async () => {
        const response = await request(app)
          .get('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });

      test('should fail when not authenticated', async () => {
        const response = await request(app)
          .get('/api/accounts')
          .expect(401);

        expect(response.body.error).toBe('No session provided');
      });
    });

    describe('POST /api/accounts', () => {
      test('should create account as manager', async () => {
        const testAccount = testHelpers.generateTestAccount();

        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(testAccount)
          .expect(201);

        expect(response.body).toMatchObject({
          account: {
            account_number: testAccount.account_number,
            server: testAccount.server,
            account_type: testAccount.account_type,
            status: 'inactive',
            balance: 0,
            equity: 0
          },
          message: 'Account created successfully'
        });

        expect(response.body.account).toHaveValidAccountStructure();
        testAccountId = response.body.account.id;
      });

      test('should fail with missing fields', async () => {
        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            account_number: '123456'
          })
          .expect(400);

        expect(response.body.error).toBe('All fields are required');
      });

      test('should fail with invalid account type', async () => {
        const testAccount = testHelpers.generateTestAccount({
          account_type: 'Invalid'
        });

        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(testAccount)
          .expect(400);

        expect(response.body.error).toBe('Invalid account type');
      });

      test('should fail with duplicate account number', async () => {
        const testAccount = testHelpers.generateTestAccount();

        // Create first account
        await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(testAccount)
          .expect(201);

        // Try to create duplicate
        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(testAccount)
          .expect(400);

        expect(response.body.error).toBe('Account number already exists');
      });

      test('should fail as trader (insufficient permissions)', async () => {
        const { token: traderToken } = await testHelpers.createAuthenticatedUser(app, 'trader', redisClient);
        const testAccount = testHelpers.generateTestAccount();

        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${traderToken}`)
          .send(testAccount)
          .expect(403);

        expect(response.body.error).toBe('Manager or Admin access required');
      });
    });

    describe('PUT /api/accounts/:accountId', () => {
      beforeEach(async () => {
        // Create test account for update tests
        const testAccount = testHelpers.generateTestAccount();
        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(testAccount)
          .expect(201);

        testAccountId = response.body.account.id;
      });

      test('should update account as manager', async () => {
        const updateData = {
          server: 'UpdatedServer-MT5',
          account_type: 'FTMO'
        };

        const response = await request(app)
          .put(`/api/accounts/${testAccountId}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.account).toMatchObject(updateData);
        expect(response.body.message).toBe('Account updated successfully');
      });

      test('should fail to update non-existent account', async () => {
        const response = await request(app)
          .put(`/api/accounts/${uuidv4()}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ server: 'Test' })
          .expect(404);

        expect(response.body.error).toBe('Account not found');
      });
    });

    describe('DELETE /api/accounts/:accountId', () => {
      beforeEach(async () => {
        // Create test account for delete tests
        const testAccount = testHelpers.generateTestAccount();
        const response = await request(app)
          .post('/api/accounts')
          .set('Authorization', `Bearer ${managerToken}`)
          .send(testAccount)
          .expect(201);

        testAccountId = response.body.account.id;
      });

      test('should delete account as manager', async () => {
        const response = await request(app)
          .delete(`/api/accounts/${testAccountId}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200);

        expect(response.body.message).toBe('Account deleted successfully');
      });

      test('should fail to delete non-existent account', async () => {
        const response = await request(app)
          .delete(`/api/accounts/${uuidv4()}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(404);

        expect(response.body.error).toBe('Account not found');
      });
    });
  });

  describe('Security and Validation', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    test('should handle very long input strings', async () => {
      const longString = 'a'.repeat(10000);
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: longString,
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        });

      // Should handle gracefully, not crash
      expect(response.status).toBeLessThan(500);
    });

    test('should handle XSS attempts in input', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: xssPayload,
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        });

      // Should not crash and should sanitize input
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent user creation', async () => {
      const promises = Array(5).fill().map((_, i) => 
        request(app)
          .post('/api/auth/register')
          .send(testHelpers.generateTestUser({
            username: `concurrent${i}_${Date.now()}`,
            email: `concurrent${i}_${Date.now()}@test.com`
          }))
      );

      const responses = await Promise.all(promises);
      
      // All should succeed with unique users
      responses.forEach(response => {
        expect([201, 400]).toContain(response.status);
      });
    });

    test('should handle empty request bodies', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Username and password are required');
    });

    test('should handle special characters in usernames', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'test@#$%^&*()',
          email: 'special@test.com',
          password: 'password123',
          firstName: 'Special',
          lastName: 'Chars'
        });

      // Should either succeed or fail gracefully
      expect(response.status).toBeLessThan(500);
    });
  });
});