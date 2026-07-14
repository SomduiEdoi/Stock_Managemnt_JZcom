import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import {
  buildTransactionDocumentHtml,
  type PrintableTransaction,
} from "@/features/transactions/transaction-document";

const execFileAsync = promisify(execFile);

const chromeExecutableCandidates = [
  process.env.CHROME_EXECUTABLE_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

function findChromeExecutable() {
  return chromeExecutableCandidates.find((candidate) => existsSync(candidate));
}

export async function renderTransactionPdf(transaction: PrintableTransaction) {
  const executablePath = findChromeExecutable();

  if (!executablePath) {
    throw new Error(
      "Chrome or Edge executable was not found. Set CHROME_EXECUTABLE_PATH in .env.",
    );
  }

  const workdir = await mkdtemp(join(tmpdir(), "stock-pdf-"));
  const htmlPath = join(workdir, "transaction.html");
  const pdfPath = join(workdir, "transaction.pdf");
  const userDataDir = join(workdir, "chrome-profile");

  try {
    await writeFile(htmlPath, buildTransactionDocumentHtml(transaction), "utf8");
    await execFileAsync(
      executablePath,
      [
        "--headless=new",
        "--disable-background-networking",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--no-sandbox",
        "--no-pdf-header-footer",
        "--print-to-pdf-no-header",
        `--user-data-dir=${userDataDir}`,
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).toString(),
      ],
      { timeout: 60000 },
    );

    return readFile(pdfPath);
  } finally {
    await rm(workdir, { force: true, recursive: true });
  }
}
