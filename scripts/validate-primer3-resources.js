const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const requested = process.argv.slice(2);
const targets = requested.length
  ? requested
  : [`${process.platform}-${process.arch}`];

const missing = [];

for (const target of targets) {
  const platform = target.split("-")[0];
  const exeName = platform === "win32" ? "primer3_core.exe" : "primer3_core";
  const baseDir = path.join(projectRoot, "bin", "primer3", target);
  const required = [
    path.join(baseDir, exeName),
    path.join(baseDir, "primer3_config"),
  ];

  for (const requiredPath of required) {
    if (!fs.existsSync(requiredPath)) {
      missing.push(requiredPath);
    }
  }
}

if (missing.length) {
  console.error("Missing Primer3 packaging resources:");
  missing.forEach((item) => console.error(`  ${item}`));
  console.error(
    "Run `yarn prepare-primer3:source` on each target platform, or provide PRIMER3_CORE_PATH, PRIMER3_CONFIG_PATH, and PRIMER3_PLATFORM_ARCH for prebuilt binaries."
  );
  process.exit(1);
}

console.info(`Primer3 resources ready for: ${targets.join(", ")}`);
