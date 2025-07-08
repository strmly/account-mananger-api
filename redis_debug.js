const redis = require('redis');

async function debugRedisConnection() {
    console.log('🔍 Debugging Redis connection from JavaScript...\n');
    
    const redisClient = redis.createClient({
        host: 'redis-11451.c9.us-east-1-4.ec2.redns.redis-cloud.com',
        port: 11451,
        username: 'default',
        password: 'rmNYR7f7baKHoDDQZfs0XuGLSBli1sxd',
        db: 0,
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        // Connect to Redis
        await redisClient.connect();
        console.log('✅ Redis connection successful');
        
        // Test ping
        const pingResult = await redisClient.ping();
        console.log(`🏓 Ping result: ${pingResult}`);
        
        // Get all keys
        const keys = await redisClient.keys('*');
        console.log(`📊 Total keys: ${keys.length}`);
        console.log(`🔑 Keys: ${JSON.stringify(keys, null, 2)}`);
        
        // Test write/read
        await redisClient.set('test_connection_js', 'hello_from_javascript');
        const testValue = await redisClient.get('test_connection_js');
        console.log(`🧪 Test write/read: ${testValue}`);
        
        // Get server info
        const serverInfo = await redisClient.info('server');
        const serverLines = serverInfo.split('\n');
        const redisVersion = serverLines.find(line => line.startsWith('redis_version:'));
        console.log(`🖥️  Server info: ${redisVersion || 'Version unknown'}`);
        
        // Look for specific keys
        console.log('\n🔍 Checking for specific keys:');
        const specificKeys = ['mt5_accounts', 'platform_users', 'test_connection_python'];
        
        for (const key of specificKeys) {
            const exists = await redisClient.exists(key);
            if (exists) {
                const value = await redisClient.get(key);
                const displayValue = value && value.length > 100 
                    ? `${value.substring(0, 100)}...` 
                    : value;
                console.log(`   ✅ ${key}: ${displayValue}`);
            } else {
                console.log(`   ❌ ${key}: not found`);
            }
        }
        
        // Show connection details
        console.log('\n🔧 Connection Details:');
        console.log(`   Host: ${redisClient.options.socket.host}`);
        console.log(`   Port: ${redisClient.options.socket.port}`);
        console.log(`   Database: ${redisClient.options.database || 0}`);
        console.log(`   TLS: ${redisClient.options.socket.tls ? 'enabled' : 'disabled'}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        try {
            await redisClient.quit();
            console.log('\n🔌 Redis connection closed');
        } catch (error) {
            console.error('Error closing connection:', error.message);
        }
    }
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});

// Run the debug function
if (require.main === module) {
    debugRedisConnection()
        .then(() => {
            console.log('✅ Debug complete');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Debug failed:', error);
            process.exit(1);
        });
}

module.exports = { debugRedisConnection };