const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(".artifacts/vitest.json", "utf8"));
const required = [
  "workflow-postgres.integration.test.ts",
  "workflow-concurrency.integration.test.ts",
  "login-security.integration.test.ts",
  "warehouse-scope.integration.test.ts",
];
if (!report.success || report.numPendingTests !== 0 || report.numTodoTests !== 0) {
  throw new Error("CI requires all tests to pass with no skipped or todo cases.");
}
for (const name of required) {
  const suite = report.testResults.find((entry) => entry.name.replaceAll("\\", "/").endsWith(`/${name}`));
  if (!suite || !suite.assertionResults.length || suite.assertionResults.some((test) => test.status !== "passed")) {
    throw new Error(`Missing or incomplete integration suite: ${name}`);
  }
}
console.log(`Verified ${report.numPassedTests} passing tests, no skips, all required PostgreSQL suites present.`);
