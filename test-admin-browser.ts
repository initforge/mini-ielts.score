import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const EVIDENCE_DIR = '.agent/evidence/INJ-004/browser-visual';
const BASE_URL = 'http://localhost:5173';

// Ensure evidence dir exists
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

interface TestResult {
  testName: string;
  viewport: string;
  timestamp: string;
  success: boolean;
  error?: string;
  consoleMessages: string[];
  networkRequests: { url: string; status: number; type: string }[];
  screenshot?: string;
}

const results: TestResult[] = [];

async function captureEvidence(page: Page, testName: string, viewport: string): Promise<TestResult> {
  const result: TestResult = {
    testName,
    viewport,
    timestamp: new Date().toISOString(),
    success: false,
    consoleMessages: [],
    networkRequests: []
  };

  try {
    // Capture console messages
    page.on('console', msg => {
      result.consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Capture network requests
    page.on('response', response => {
      result.networkRequests.push({
        url: response.url(),
        status: response.status(),
        type: response.request().resourceType()
      });
    });

    // Take screenshot
    const screenshotPath = path.join(EVIDENCE_DIR, `${testName}_${viewport.replace('x', 'x')}_screenshot.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot = screenshotPath;
    result.success = true;

  } catch (err) {
    result.error = String(err);
  }

  return result;
}

async function runAdminTests() {
  console.log('Starting Admin browser/CDP tests...\n');

  // Launch browser with CDP
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Test 1: Desktop (1280x720)
  console.log('Test 1: Admin Desktop (1280x720)');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideoDir: undefined
  });
  const desktopPage = await desktopContext.newPage();

  try {
    await desktopPage.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle', timeout: 30000 });
    const desktopResult = await captureEvidence(desktopPage, 'admin_desktop', '1280x720');
    results.push(desktopResult);

    // Navigate to de-thi-online
    await desktopPage.goto(`${BASE_URL}/admin/de-thi-online`, { waitUntil: 'networkidle', timeout: 30000 });
    const desktopExamResult = await captureEvidence(desktopPage, 'admin_desktop_de-thi-online', '1280x720');
    results.push(desktopExamResult);
  } finally {
    await desktopContext.close();
  }

  // Test 2: Tablet (768x1024)
  console.log('Test 2: Admin Tablet (768x1024)');
  const tabletContext = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2
  });
  const tabletPage = await tabletContext.newPage();

  try {
    await tabletPage.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle', timeout: 30000 });
    const tabletResult = await captureEvidence(tabletPage, 'admin_tablet', '768x1024');
    results.push(tabletResult);

    // Navigate to de-thi-online
    await tabletPage.goto(`${BASE_URL}/admin/de-thi-online`, { waitUntil: 'networkidle', timeout: 30000 });
    const tabletExamResult = await captureEvidence(tabletPage, 'admin_tablet_de-thi-online', '768x1024');
    results.push(tabletExamResult);
  } finally {
    await tabletContext.close();
  }

  await browser.close();

  // Save results
  const summaryPath = path.join(EVIDENCE_DIR, 'test_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  // Generate console/network summary
  const summaryLines = ['=== ADMIN BROWSER/CDP TEST SUMMARY ===', ''];
  summaryLines.push(`Timestamp: ${new Date().toISOString()}`);
  summaryLines.push(`Base URL: ${BASE_URL}`);
  summaryLines.push(`Total Tests: ${results.length}`);
  summaryLines.push(`Successful: ${results.filter(r => r.success).length}`);
  summaryLines.push(`Failed: ${results.filter(r => !r.success).length}`);
  summaryLines.push('');

  for (const r of results) {
    summaryLines.push(`--- ${r.testName} (${r.viewport}) ---`);
    summaryLines.push(`Status: ${r.success ? 'PASS' : 'FAIL'}`);
    if (r.error) summaryLines.push(`Error: ${r.error}`);
    summaryLines.push(`Screenshot: ${r.screenshot || 'N/A'}`);
    summaryLines.push(`Console Messages (${r.consoleMessages.length}):`);
    r.consoleMessages.slice(0, 20).forEach(m => summaryLines.push(`  ${m}`));
    if (r.consoleMessages.length > 20) summaryLines.push(`  ... and ${r.consoleMessages.length - 20} more`);
    summaryLines.push(`Network Requests (${r.networkRequests.length}):`);
    r.networkRequests.slice(0, 30).forEach(n => summaryLines.push(`  [${n.status}] ${n.url.substring(0, 100)} (${n.type})`));
    if (r.networkRequests.length > 30) summaryLines.push(`  ... and ${r.networkRequests.length - 30} more`);
    summaryLines.push('');
  }

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'console_network_summary.txt'), summaryLines.join('\n'));

  console.log('\n=== TEST COMPLETE ===');
  console.log(`Evidence saved to: ${EVIDENCE_DIR}`);
  console.log(`Summary: ${summaryPath}`);
}

runAdminTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
