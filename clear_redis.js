const redis = require('redis');

async function clearAllRedisData() {
    console.log('🗑️ Starting Redis data cleanup...\n');
    
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
        console.log('✅ Connected to Redis Cloud');
        
        // Get all keys first
        const keys = await redisClient.keys('*');
        console.log(`📊 Found ${keys.length} keys to delete:`);
        
        if (keys.length === 0) {
            console.log('No keys to delete. Redis is already empty.');
            return;
        }
        
        // Show what will be deleted
        keys.forEach((key, index) => {
            console.log(`   ${index + 1}. ${key}`);
        });
        
        console.log('\n🔥 Deleting all keys...');
        
        // Method 1: Delete keys individually (shows progress)
        let deletedCount = 0;
        for (const key of keys) {
            try {
                const result = await redisClient.del(key);
                if (result === 1) {
                    deletedCount++;
                    console.log(`   ✅ Deleted: ${key}`);
                } else {
                    console.log(`   ❌ Failed to delete: ${key}`);
                }
            } catch (error) {
                console.log(`   ❌ Error deleting ${key}: ${error.message}`);
            }
        }
        
        console.log(`\n🎉 Successfully deleted ${deletedCount} out of ${keys.length} keys`);
        
        // Verify deletion
        const remainingKeys = await redisClient.keys('*');
        if (remainingKeys.length === 0) {
            console.log('✅ All keys successfully deleted. Redis is now empty.');
        } else {
            console.log(`⚠️ Warning: ${remainingKeys.length} keys still remain:`, remainingKeys);
        }
        
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

// Alternative function using FLUSHDB (faster)
async function flushRedisDatabase() {
    console.log('🗑️ Flushing entire Redis database...\n');
    
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
        await redisClient.connect();
        console.log('✅ Connected to Redis Cloud');
        
        // Get count before deletion
        const keys = await redisClient.keys('*');
        console.log(`📊 About to delete ${keys.length} keys`);
        
        // Flush all keys in current database
        await redisClient.flushDb();
        console.log('🔥 Database flushed successfully');
        
        // Verify
        const remainingKeys = await redisClient.keys('*');
        console.log(`✅ Verification: ${remainingKeys.length} keys remaining`);
        
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

// Handle command line arguments
const args = process.argv.slice(2);
const useFlush = args.includes('--flush');

if (require.main === module) {
    const cleanupFunction = useFlush ? flushRedisDatabase : clearAllRedisData;
    const method = useFlush ? 'FLUSHDB' : 'individual deletion';
    
    console.log(`Using method: ${method}`);
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    
    // Give user a chance to cancel
    setTimeout(() => {
        cleanupFunction()
            .then(() => {
                console.log('✅ Cleanup complete');
                process.exit(0);
            })
            .catch((error) => {
                console.error('Cleanup failed:', error);
                process.exit(1);
            });
    }, 5000);
}

module.exports = { clearAllRedisData, flushRedisDatabase };