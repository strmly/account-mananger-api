const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 5000;

// JSON body parser
app.use(express.json());

// ── Malformed‐JSON handler ───────────────────────────────────────────────────────
// Catch body-parser syntax errors and return 400 instead of falling through to 500
app.use((err, req, res, next) => {
  if (
    err.status === 400 &&
    typeof err.body === 'string'
  ) {
    return res.status(400).json({ error: 'Bad Request' });
  }
  next(err);
});

// catch JSON parse errors and return 400
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError
      && err.status === 400
      && 'body' in err
  ) {
    return res.status(400).json({ error: 'Bad Request' });
  }
  next(err);
});


// Middleware
app.use(cors({
  origin: ['https://account-mananger-ui-fuag.vercel.app', 'http://localhost:5173'], // Add your frontend URLs
  credentials: true
}));
app.use(express.json());

// Redis Cloud connection
// Alternative Redis Cloud connection
const redisClient = redis.createClient({
  socket: {
    host: 'redis-11451.c9.us-east-1-4.ec2.redns.redis-cloud.com',
    port: 11451,
    
  },
  username: 'default',
  password: 'rmNYR7f7baKHoDDQZfs0XuGLSBli1sxd',
  database: 0
});

// Connect to Redis
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis Cloud successfully!');
});

// Only connect if not in test environment
if (process.env.NODE_ENV !== 'test') {
  redisClient.connect();
}

// Helper functions
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const generateSessionId = () => {
  return uuidv4();
};

// Validation functions
const validateProvider = (provider) => {
  const validProviders = ['ftmo', 'forex', 'xm'];
  return validProviders.includes(provider.toLowerCase());
};

const validateAccountType = (accountType) => {
  const validTypes = ['challenge', 'verification', 'live'];
  return validTypes.includes(accountType.toLowerCase());
};

// Middleware to verify session
const verifySession = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No session provided' });
    }

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await redisClient.get(`session:${sessionId}`);
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const sessionInfo = JSON.parse(sessionData);
    
    // Check if session expired
    if (new Date() > new Date(sessionInfo.expires_at)) {
      await redisClient.del(`session:${sessionId}`);
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = sessionInfo;
    req.sessionId = sessionId;
    next();
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Session verification failed' });
  }
};

// Middleware to verify admin role
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'trader') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Middleware to verify admin or manager role
const verifyManagerOrAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.role !== 'trader') {
    return res.status(403).json({ error: 'Manager or Admin access required' });
  }
  next();
};

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get users from Redis
    const usersData = await redisClient.get('platform_users');
    const users = usersData ? JSON.parse(usersData) : [];

    // Find user
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Update last login
    user.last_login = new Date().toISOString();
    await redisClient.set('platform_users', JSON.stringify(users));

    // Create session
    const sessionId = generateSessionId();
    const sessionData = {
      user_id: user.id,
      username: user.username,
      role: user.role,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    await redisClient.setEx(`session:${sessionId}`, 86400, JSON.stringify(sessionData)); // 24 hours

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      user: userResponse,
      session_id: sessionId,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Get existing users
    const usersData = await redisClient.get('platform_users');
    const users = usersData ? JSON.parse(usersData) : [];

    // Check if username exists
    if (users.some(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email exists
    if (users.some(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user
    const newUser = {
      id: uuidv4(),
      username,
      email,
      firstName,
      lastName,
      password: hashedPassword,
      role: 'trader', // Default role
      status: 'active',
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };

    users.push(newUser);
    await redisClient.set('platform_users', JSON.stringify(users));

    // Create session
    const sessionId = generateSessionId();
    const sessionData = {
      user_id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    await redisClient.setEx(`session:${sessionId}`, 86400, JSON.stringify(sessionData));

    // Remove password from response
    const { password: _, ...userResponse } = newUser;

    res.status(201).json({
      user: userResponse,
      session_id: sessionId,
      message: 'Registration successful'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/logout', verifySession, async (req, res) => {
  try {
    await redisClient.del(`session:${req.sessionId}`);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/auth/verify', verifySession, async (req, res) => {
  try {
    // Get user data
    const usersData = await redisClient.get('platform_users');
    if (usersData) {
      const users = JSON.parse(usersData);
      const user = users.find(u => u.id === req.user.user_id);
      if (user) {
        const { password: _, ...userResponse } = user;
        return res.json({ user: userResponse });
      }
    }

    res.status(404).json({ error: 'User not found' });
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Session verification failed' });
  }
});

// Account management endpoints
app.get('/api/accounts', verifySession, async (req, res) => {
  try {
    const keys = await redisClient.keys('*');
    console.log(keys);

    if (keys.length === 0) {
      return res.json([]);
    }
    const accountsData = await redisClient.get('mt5_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];
    console.log(accounts)
    res.json(accounts);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.post('/api/accounts', verifySession, verifyManagerOrAdmin, async (req, res) => {
  try {
    const { account_number, password, server, base_balance, account_type, provider } = req.body;

    // Validate required fields
    if (!account_number || !password || !server || !provider) {
      return res.status(400).json({ error: 'Account number, password, server, and provider are required' });
    }

    // Validate provider
    if (!validateProvider(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be one of: ftmo, forex, xm' });
    }

    // Validate account type (optional, defaults to 'challenge')
    const accountTypeValue = account_type ? account_type.toLowerCase() : 'challenge';
    if (!validateAccountType(accountTypeValue)) {
      return res.status(400).json({ error: 'Invalid account type. Must be one of: challenge, verification, account' });
    }

    // Validate base_balance (optional, defaults to 0)
    const baseBalance = base_balance || 0;
    if (typeof baseBalance !== 'number' || baseBalance < 0) {
      return res.status(400).json({ error: 'Base balance must be a non-negative number' });
    }

    // Get existing accounts
    const accountsData = await redisClient.get('mt5_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];

    // Check if account number already exists
    if (accounts.some(acc => acc.account_number === account_number)) {
      return res.status(400).json({ error: 'Account number already exists' });
    }

    // Create new account
    const newAccount = {
      id: uuidv4(),
      account_number,
      password, // In production, consider encryption
      server,
      base_balance: baseBalance,
      account_type: accountTypeValue,
      provider: provider.toLowerCase(),
      status: 'active',
      balance: 0,
      equity: 0,
      created_at: new Date().toISOString(),
      created_by: req.user.username
    };

    accounts.push(newAccount);
    await redisClient.set('mt5_accounts', JSON.stringify(accounts));

    res.status(201).json({
      account: newAccount,
      message: 'Account created successfully'
    });

  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.put('/api/accounts/:accountId', verifySession, verifyManagerOrAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { account_number, password, server, base_balance, account_type, provider } = req.body;

    // Get existing accounts
    const accountsData = await redisClient.get('mt5_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];

    // Find account
    const accountIndex = accounts.findIndex(acc => acc.id === accountId);
    if (accountIndex === -1) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Validate provider if provided
    if (provider && !validateProvider(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be one of: ftmo, forex, xm' });
    }

    // Validate account type if provided
    if (account_type && !validateAccountType(account_type)) {
      return res.status(400).json({ error: 'Invalid account type. Must be one of: challenge, verification, account' });
    }

    // Validate base_balance if provided
    if (base_balance !== undefined && (typeof base_balance !== 'number' || base_balance < 0)) {
      return res.status(400).json({ error: 'Base balance must be a non-negative number' });
    }

    // Check if account number already exists (excluding current account)
    if (account_number && accounts.some(acc => acc.account_number === account_number && acc.id !== accountId)) {
      return res.status(400).json({ error: 'Account number already exists' });
    }

    // Update account fields
    const account = accounts[accountIndex];
    if (account_number) account.account_number = account_number;
    if (password) account.password = password;
    if (server) account.server = server;
    if (base_balance !== undefined) account.base_balance = base_balance;
    if (account_type) account.account_type = account_type.toLowerCase();
    if (provider) account.provider = provider.toLowerCase();

    account.updated_at = new Date().toISOString();
    account.updated_by = req.user.username;

    accounts[accountIndex] = account;
    await redisClient.set('mt5_accounts', JSON.stringify(accounts));

    res.json({
      account: account,
      message: 'Account updated successfully'
    });

  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

app.delete('/api/accounts/:accountId', verifySession, verifyManagerOrAdmin, async (req, res) => {
  try {
    const { accountId } = req.params;

    // Get existing accounts
    const accountsData = await redisClient.get('mt5_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];

    // Filter out the account to delete
    const filteredAccounts = accounts.filter(acc => acc.id !== accountId);

    if (filteredAccounts.length === accounts.length) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await redisClient.set('mt5_accounts', JSON.stringify(filteredAccounts));

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// User management endpoints (admin only)
app.get('/api/users', verifySession, verifyAdmin, async (req, res) => {
  try {
    const usersData = await redisClient.get('platform_users');
    const users = usersData ? JSON.parse(usersData) : [];
    
    // Remove passwords from response
    const usersResponse = users.map(({ password, ...user }) => user);
    
    res.json(usersResponse);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', verifySession, verifyAdmin, async (req, res) => {
  try {
    const { username, email, firstName, lastName, role, password } = req.body;

    // Validate required fields
    if (!username || !email || !firstName || !lastName || !role || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate role
    if (!['admin', 'manager', 'trader', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Get existing users
    const usersData = await redisClient.get('platform_users');
    const users = usersData ? JSON.parse(usersData) : [];

    // Check if username exists
    if (users.some(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email exists
    if (users.some(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user
    const newUser = {
      id: uuidv4(),
      username,
      email,
      firstName,
      lastName,
      password: hashedPassword,
      role,
      status: 'active',
      created_at: new Date().toISOString()
    };

    users.push(newUser);
    await redisClient.set('platform_users', JSON.stringify(users));

    // Remove password from response
    const { password: _, ...userResponse } = newUser;

    res.status(201).json({
      user: userResponse,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:userId', verifySession, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, firstName, lastName, role, status, password } = req.body;

    // Get existing users
    const usersData = await redisClient.get('platform_users');
    const users = usersData ? JSON.parse(usersData) : [];

    // Find user
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent user from deactivating themselves
    if (userId === req.user.user_id && status === 'inactive') {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    // Validate role if provided
    if (role && !['admin', 'manager', 'trader', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if username already exists (excluding current user)
    if (username && users.some(u => u.username === username && u.id !== userId)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists (excluding current user)
    if (email && users.some(u => u.email === email && u.id !== userId)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Update user fields
    const user = users[userIndex];
    if (username) user.username = username;
    if (email) user.email = email;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (role) user.role = role;
    if (status) user.status = status;
    
    // Update password if provided
    if (password) {
      user.password = await hashPassword(password);
    }

    user.updated_at = new Date().toISOString();

    users[userIndex] = user;
    await redisClient.set('platform_users', JSON.stringify(users));

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      user: userResponse,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:userId', verifySession, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent user from deleting themselves
    if (userId === req.user.user_id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Get existing users
    const usersData = await redisClient.get('platform_users');
    const users = usersData ? JSON.parse(usersData) : [];

    // Filter out the user to delete
    const filteredUsers = users.filter(u => u.id !== userId);

    if (filteredUsers.length === users.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    await redisClient.set('platform_users', JSON.stringify(filteredUsers));

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await redisClient.ping();
    res.json({ 
      status: 'healthy', 
      redis: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      redis: 'disconnected',
      error: error.message 
    });
  }
});

// Initialize default admin user if none exists
const initDefaultUser = async () => {
  try {
    const usersData = await redisClient.get('platform_users');
    if (!usersData) {
      const hashedPassword = await hashPassword('admin123');
      const defaultAdmin = {
        id: uuidv4(),
        username: 'admin',
        email: 'admin@trading.com',
        firstName: 'System',
        lastName: 'Administrator',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString()
      };

      await redisClient.set('platform_users', JSON.stringify([defaultAdmin]));
      console.log('✅ Default admin user created: admin/admin123');
    } else {
      console.log('✅ Users already exist in database');
    }
  } catch (error) {
    console.error('❌ Error initializing default user:', error);
  }
};

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Export app for testing
module.exports = app;

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const startServer = async () => {
    try {
      await initDefaultUser();
      
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
        console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
        console.log(`✨ Phase field support enabled for account management`);
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  };

  startServer();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down server...');
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    process.exit(0);
  });
}
