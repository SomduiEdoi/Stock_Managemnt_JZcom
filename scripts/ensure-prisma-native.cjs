const fs = require("node:fs");
const path = require("node:path");

const clientPath = path.join(
  process.cwd(),
  "node_modules",
  ".prisma",
  "client",
  "index.js",
);
const enginePath = path.join(
  process.cwd(),
  "node_modules",
  ".prisma",
  "client",
  "query_engine-windows.dll.node",
);

if (!fs.existsSync(clientPath)) {
  process.exit(0);
}

const source = fs.readFileSync(clientPath, "utf8");
if (!source.includes('"copyEngine": false')) {
  process.exit(0);
}

if (!fs.existsSync(enginePath)) {
  console.warn(
    "Prisma native engine is missing. Run `npm run prisma:generate` before starting dev.",
  );
  process.exit(0);
}

fs.writeFileSync(
  clientPath,
  source.replace('"copyEngine": false', '"copyEngine": true'),
);
console.log("Fixed Prisma Client native engine marker (copyEngine=true).");
