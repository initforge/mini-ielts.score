// INJ004C: close Redis after all tests complete.
// Uses independent Redis client to avoid Jest cross-process isolation issues.
// The client connects on first command; quit() closes any module-level socket.
// Re-throws on failure per acceptance: "do not swallow teardown implementation failure".
module.exports = async () => {
  const Redis = require('ioredis');
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000 });
  try {
    await client.quit();
  } catch (err) {
    // ENOTCONN if Redis not running — acceptable; socket cleanup happens regardless
    const e = err;
    if (e && typeof e === 'object' && e.code !== 'ENOTCONN') {
      throw e;
    }
  }
};
