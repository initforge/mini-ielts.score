import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const EVIDENCE_DIR = '.agent/evidence/INJ-004/browser-visual';
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:7000';

// Routes to test
const ROUTES = [
  { name: 'unauth_root', path: '/', auth: false },
  { name: 'admin_login', path: '/admin/login', auth: false },
  { name: 'admin_de-thi-online', path: '/admin/de-thi-online', auth: true },
  { name: 'admin_de-hon-hop', path: '/admin/de-hon-hop', auth: true },
  { name: 'admin_ket-qua-thi-online', path: '/admin/ket-qua-thi-online', auth: true },
  { name: 'admin_nhap-de-thi-online', path: '/admin/nhap-de-thi-online', auth: true },
];

const VIEWPORTS = [
  { name: 'desktop_1280x720', width: 1280, height: 720 },
  { name: 'tablet_768x1024', width: 768, height: 1024, deviceScaleFactor: 2 },
];

const ADMIN_EMAIL = 'seed.owner@example.com';
const ADMIN_PASSWORD = 'seed-password-123';

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

interface TestResult {
  testName: string;
  viewport: string;
  timestamp: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  consoleMessages: { type: string; text: string }[];
  networkRequests: { url: string; status: number; type: string }[];
  cdpMetrics?: Record<string, number>;
  screenshotPath?: string;
  loginSuccess?: boolean;
}

async function getCDPMetrics(page: Page): Promise<Record<string, number>> {
  try {
    const client = await page.context().newCDPSession(page);
    const metrics = await client.send('Performance.getMetrics');
    const result: Record<string, number> = {};
    for (const m of metrics.metrics) {
      if (['TaskDuration', 'ScriptDuration', 'LayoutCount', 'RecalcStyleCount', 'Timestamp'].includes(m.name)) {
        result[m.name] = m.value as number;
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function runTests() {
  console.log('=== INJ-004 Browser Visual Verification ===\n');
  console.log('Starting Chrome CDP browser tests...\n');

  const results: TestResult[] = [];
  
  // Use remote debugging port
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=9222']
  });

  for (const viewport of VIEWPORTS) {
    console.log(`\n--- Viewport: ${viewport.name} ---`);
    
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
    });

    const page = await context.newPage();

    for (const route of ROUTES) {
      const testName = `${viewport.name}_${route.name}`;
      const result: TestResult = {
        testName,
        viewport: viewport.name,
        timestamp: new Date().toISOString(),
        success: false,
        consoleMessages: [],
        networkRequests: [],
      };

      console.log(`  Testing: ${route.name}...`);

      try {
        // Capture console
        const consoleHandler = (msg: any) => {
          result.consoleMessages.push({ type: msg.type(), text: msg.text() });
        };
        page.on('console', consoleHandler);

        // Capture network
        const networkHandler = (response: any) => {
          const url = response.url();
          if (url.startsWith(FRONTEND_URL) || url.startsWith(BACKEND_URL)) {
            result.networkRequests.push({
              url: url.replace(FRONTEND_URL, '').replace(BACKEND_URL, ''),
              status: response.status(),
              type: response.request().resourceType(),
            });
          }
        };
        page.on('response', networkHandler);

        // Navigate to route
        const navPromise = page.goto(`${FRONTEND_URL}${route.path}`, { 
          waitUntil: 'networkidle', 
          timeout: 30000 
        });
        
        // Wait a bit for any deferred rendering
        await page.waitForTimeout(1000);
        
        const response = await navPromise;
        result.statusCode = response?.status();

        // Login if required
        if (route.auth) {
          // Check if we need to login
          const loginFormVisible = await page.locator('input[type="email"], input[name="email"]').isVisible().catch(() => false);
          
          if (loginFormVisible) {
            console.log(`    -> Needs login, filling credentials...`);
            await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL);
            await page.fill('input[type="password"], input[name="password"]', ADMIN_PASSWORD);
            await page.click('button[type="submit"]');
            await page.waitForTimeout(2000);
            result.loginSuccess = true;
          }
        }

        // Get CDP metrics
        result.cdpMetrics = await getCDPMetrics(page);

        // Take screenshot
        const screenshotPath = path.join(EVIDENCE_DIR, `${testName}_screenshot.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshotPath = screenshotPath;
        result.success = true;

        console.log(`    -> PASS (${result.statusCode})`);
      } catch (err: any) {
        result.error = err.message;
        console.log(`    -> FAIL: ${err.message}`);
      }

      results.push(result);
    }

    await context.close();
  }

  await browser.close();

  // Save all results
  const summaryPath = path.join(EVIDENCE_DIR, 'test_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  // Generate text summary
  const lines: string[] = [];
  lines.push('=== INJ-004 BROWSER VISUAL VERIFICATION SUMMARY ===');
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push(`Frontend: ${FRONTEND_URL}`);
  lines.push(`Backend: ${BACKEND_URL}`);
  lines.push(`Total Tests: ${results.length}`);
  lines.push(`Successful: ${results.filter(r => r.success).length}`);
  lines.push(`Failed: ${results.filter(r => !r.success).length}`);
  lines.push('');

  for (const r of results) {
    lines.push(`--- ${r.testName} ---`);
    lines.push(`Status: ${r.success ? 'PASS' : 'FAIL'}`);
    if (r.error) lines.push(`Error: ${r.error}`);
    if (r.statusCode) lines.push(`HTTP Status: ${r.statusCode}`);
    if (r.screenshotPath) lines.push(`Screenshot: ${r.screenshotPath}`);
    if (r.consoleMessages.length) {
      lines.push(`Console Messages (${r.consoleMessages.length}):`);
      r.consoleMessages.slice(0, 10).forEach(m => lines.push(`  [${m.type}] ${m.text.substring(0, 200)}`));
      if (r.consoleMessages.length > 10) lines.push(`  ... and ${r.consoleMessages.length - 10} more`);
    }
    if (r.networkRequests.length) {
      lines.push(`Network Requests (${r.networkRequests.length}):`);
      r.networkRequests.slice(0, 20).forEach(n => lines.push(`  [${n.status}] ${n.url} (${n.type})`));
      if (r.networkRequests.length > 20) lines.push(`  ... and ${r.networkRequests.length - 20} more`);
    }
    if (r.cdpMetrics && Object.keys(r.cdpMetrics).length) {
      lines.push(`CDP Metrics: ${JSON.stringify(r.cdpMetrics)}`);
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'console_network_summary.txt'), lines.join('\n'));

  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log(`Evidence dir: ${EVIDENCE_DIR}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(`Text report: ${path.join(EVIDENCE_DIR, 'console_network_summary.txt')}`);
  
  return results.filter(r => !r.success).length === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
