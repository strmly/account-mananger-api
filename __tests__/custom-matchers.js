/**
 * Custom Jest Matchers for MT5 Trading Platform Tests
 * Provides domain-specific matchers for better test readability
 */

expect.extend({
  // UUID validation
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);
    
    return {
      message: () => 
        pass 
          ? `expected "${received}" not to be a valid UUID`
          : `expected "${received}" to be a valid UUID`,
      pass,
    };
  },

  // Email validation
  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = typeof received === 'string' && emailRegex.test(received);
    
    return {
      message: () => 
        pass 
          ? `expected "${received}" not to be a valid email`
          : `expected "${received}" to be a valid email`,
      pass,
    };
  },

  // ISO 8601 date validation
  toBeValidISO8601Date(received) {
    if (typeof received !== 'string') {
      return {
        message: () => `expected "${received}" to be a string`,
        pass: false,
      };
    }
    
    const date = new Date(received);
    const pass = date instanceof Date && !isNaN(date.getTime()) && date.toISOString() === received;
    
    return {
      message: () => 
        pass 
          ? `expected "${received}" not to be a valid ISO 8601 date`
          : `expected "${received}" to be a valid ISO 8601 date`,
      pass,
    };
  },

  // User object structure validation
  toHaveValidUserStructure(received) {
    const requiredFields = ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'status', 'created_at'];
    const optionalFields = ['last_login', 'updated_at'];
    const forbiddenFields = ['password'];
    
    const missingFields = requiredFields.filter(field => !(field in received));
    const forbiddenFieldsPresent = forbiddenFields.filter(field => field in received);
    
    const pass = missingFields.length === 0 && forbiddenFieldsPresent.length === 0;
    
    let message = '';
    if (missingFields.length > 0) {
      message += `Missing required fields: ${missingFields.join(', ')}. `;
    }
    if (forbiddenFieldsPresent.length > 0) {
      message += `Forbidden fields present: ${forbiddenFieldsPresent.join(', ')}. `;
    }
    
    return {
      message: () => 
        pass 
          ? `expected user object to be invalid`
          : `expected user object to be valid. ${message}`,
      pass,
    };
  },

  // Account object structure validation
  toHaveValidAccountStructure(received) {
    const requiredFields = ['id', 'account_number', 'server', 'account_type', 'status', 'balance', 'equity', 'created_at'];
    const optionalFields = ['created_by', 'updated_at', 'updated_by', 'password'];
    
    const missingFields = requiredFields.filter(field => !(field in received));
    const pass = missingFields.length === 0;
    
    return {
      message: () => 
        pass 
          ? `expected account object to be invalid`
          : `expected account object to be valid. Missing required fields: ${missingFields.join(', ')}`,
      pass,
    };
  },

  // Session object validation
  toHaveValidSessionStructure(received) {
    const requiredFields = ['user_id', 'username', 'role', 'created_at', 'expires_at'];
    const missingFields = requiredFields.filter(field => !(field in received));
    
    // Check if expires_at is in the future
    const expiresAt = new Date(received.expires_at);
    const isExpired = new Date() > expiresAt;
    
    const pass = missingFields.length === 0 && !isExpired;
    
    let message = '';
    if (missingFields.length > 0) {
      message += `Missing required fields: ${missingFields.join(', ')}. `;
    }
    if (isExpired) {
      message += `Session is expired. `;
    }
    
    return {
      message: () => 
        pass 
          ? `expected session object to be invalid`
          : `expected session object to be valid. ${message}`,
      pass,
    };
  },

  // Role validation
  toBeValidRole(received) {
    const validRoles = ['admin', 'manager', 'trader', 'viewer'];
    const pass = validRoles.includes(received);
    
    return {
      message: () => 
        pass 
          ? `expected "${received}" not to be a valid role`
          : `expected "${received}" to be a valid role. Valid roles are: ${validRoles.join(', ')}`,
      pass,
    };
  },

  // Account type validation
  toBeValidAccountType(received) {
    const validTypes = ['FTMO', 'Forex'];
    const pass = validTypes.includes(received);
    
    return {
      message: () => 
        pass 
          ? `expected "${received}" not to be a valid account type`
          : `expected "${received}" to be a valid account type. Valid types are: ${validTypes.join(', ')}`,
      pass,
    };
  },

  // Status validation
  toBeValidStatus(received) {
    const validStatuses = ['active', 'inactive'];
    const pass = validStatuses.includes(received);
    
    return {
      message: () => 
        pass 
          ? `expected "${received}" not to be a valid status`
          : `expected "${received}" to be a valid status. Valid statuses are: ${validStatuses.join(', ')}`,
      pass,
    };
  },

  // HTTP response validation
  toBeSuccessfulResponse(received) {
    const pass = received && received.status >= 200 && received.status < 300;
    
    return {
      message: () => 
        pass 
          ? `expected response not to be successful`
          : `expected response to be successful (2xx), but got status ${received?.status}`,
      pass,
    };
  },

  toBeErrorResponse(received, expectedStatus) {
    const pass = received && received.status === expectedStatus && received.body && received.body.error;
    
    return {
      message: () => 
        pass 
          ? `expected response not to be an error response with status ${expectedStatus}`
          : `expected response to be an error response with status ${expectedStatus}, but got status ${received?.status}`,
      pass,
    };
  },

  // Performance validation
  toCompleteWithin(received, maxDuration) {
    if (typeof received !== 'object' || typeof received.duration !== 'number') {
      return {
        message: () => `expected result to have a duration property`,
        pass: false,
      };
    }
    
    const pass = received.duration <= maxDuration;
    
    return {
      message: () => 
        pass 
          ? `expected operation not to complete within ${maxDuration}ms`
          : `expected operation to complete within ${maxDuration}ms, but took ${received.duration}ms`,
      pass,
    };
  },

  // Memory usage validation
  toNotExceedMemoryUsage(received, maxMemoryMB) {
    if (typeof received !== 'object' || typeof received.heapUsed !== 'number') {
      return {
        message: () => `expected result to have a heapUsed property`,
        pass: false,
      };
    }
    
    const pass = received.heapUsed <= maxMemoryMB;
    
    return {
      message: () => 
        pass 
          ? `expected memory usage not to be within ${maxMemoryMB}MB`
          : `expected memory usage to be within ${maxMemoryMB}MB, but used ${received.heapUsed}MB`,
      pass,
    };
  },

  // Array validation
  toContainUserWithUsername(received, username) {
    if (!Array.isArray(received)) {
      return {
        message: () => `expected received to be an array`,
        pass: false,
      };
    }
    
    const pass = received.some(user => user.username === username);
    
    return {
      message: () => 
        pass 
          ? `expected array not to contain user with username "${username}"`
          : `expected array to contain user with username "${username}"`,
      pass,
    };
  },

  toContainAccountWithNumber(received, accountNumber) {
    if (!Array.isArray(received)) {
      return {
        message: () => `expected received to be an array`,
        pass: false,
      };
    }
    
    const pass = received.some(account => account.account_number === accountNumber);
    
    return {
      message: () => 
        pass 
          ? `expected array not to contain account with number "${accountNumber}"`
          : `expected array to contain account with number "${accountNumber}"`,
      pass,
    };
  },

  // Security validation
  toNotContainSensitiveData(received) {
    const sensitiveFields = ['password', 'secret', 'key', 'token'];
    const stringified = JSON.stringify(received).toLowerCase();
    
    const foundSensitiveData = sensitiveFields.filter(field => 
      stringified.includes(`"${field}":`) || stringified.includes(`${field}=`)
    );
    
    const pass = foundSensitiveData.length === 0;
    
    return {
      message: () => 
        pass 
          ? `expected data not to be clean of sensitive information`
          : `expected data to not contain sensitive information, but found: ${foundSensitiveData.join(', ')}`,
      pass,
    };
  },

  // Rate limiting validation
  toRespectRateLimit(received, maxRequestsPerSecond) {
    if (!Array.isArray(received)) {
      return {
        message: () => `expected received to be an array of timestamps`,
        pass: false,
      };
    }
    
    // Group by second and check max requests
    const requestsBySecond = {};
    received.forEach(timestamp => {
      const second = Math.floor(timestamp / 1000);
      requestsBySecond[second] = (requestsBySecond[second] || 0) + 1;
    });
    
    const maxRequestsInAnySecond = Math.max(...Object.values(requestsBySecond));
    const pass = maxRequestsInAnySecond <= maxRequestsPerSecond;
    
    return {
      message: () => 
        pass 
          ? `expected rate limit not to be respected`
          : `expected no more than ${maxRequestsPerSecond} requests per second, but found ${maxRequestsInAnySecond}`,
      pass,
    };
  },

  // Database consistency validation
  toMaintainDatabaseConsistency(received) {
    if (typeof received !== 'object' || !received.before || !received.after) {
      return {
        message: () => `expected received to have 'before' and 'after' properties`,
        pass: false,
      };
    }
    
    // Check that referenced IDs still exist
    const beforeUserIds = new Set(received.before.users?.map(u => u.id) || []);
    const afterUserIds = new Set(received.after.users?.map(u => u.id) || []);
    
    const beforeAccountCreators = new Set(received.before.accounts?.map(a => a.created_by) || []);
    const afterUsernames = new Set(received.after.users?.map(u => u.username) || []);
    
    // Check referential integrity
    const orphanedAccounts = [...beforeAccountCreators].filter(creator => 
      creator && !afterUsernames.has(creator)
    );
    
    const pass = orphanedAccounts.length === 0;
    
    return {
      message: () => 
        pass 
          ? `expected database not to maintain consistency`
          : `expected database to maintain consistency, but found orphaned references: ${orphanedAccounts.join(', ')}`,
      pass,
    };
  }
});

// Export for standalone use
module.exports = {};