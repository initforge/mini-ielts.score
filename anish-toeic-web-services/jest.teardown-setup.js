// Close module-level clients in each Jest worker. globalTeardown runs in a
// separate process and cannot reach pools/sockets created by test modules.
afterAll(async () => {
  const { pool } = require('./src/services/db.service');
  if (typeof pool.end === 'function') {
    await pool.end().catch(() => undefined);
  }

  const { shutdownRedis } = require('./src/middlewares/auth.middleware');
  await shutdownRedis();

  const { shutdownGradingRedis } = require('./src/services/grading.service');
  await shutdownGradingRedis();
});
