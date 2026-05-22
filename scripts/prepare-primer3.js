const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const primer3Version = "2.6.1";
const primer3SourceUrl = `https://github.com/primer3-org/primer3/archive/refs/tags/v${primer3Version}.tar.gz`;
const args = process.argv.slice(2);
const fromSource = args.includes("--from-source");
const platformArchArg = args.find((arg) => arg.startsWith("--platform-arch="));
const targetPlatformArch =
  process.env.PRIMER3_PLATFORM_ARCH ||
  (platformArchArg && platformArchArg.split("=")[1]) ||
  `${process.platform}-${process.arch}`;
const currentPlatformArch = `${process.platform}-${process.arch}`;
const targetPlatform = targetPlatformArch.split("-")[0];
const exeName = targetPlatform === "win32" ? "primer3_core.exe" : "primer3_core";
const projectRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(projectRoot, ".cache", "primer3");
const targetDir = path.join(projectRoot, "bin", "primer3", targetPlatformArch);
const targetExe = path.join(targetDir, exeName);
const targetConfig = path.join(targetDir, "primer3_config");
const targetLicense = path.join(targetDir, "LICENSE");

function commandPath(command) {
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
      : [""];

  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const candidates = [
        path.join(dir, command + extension.toLowerCase()),
        path.join(dir, command + extension.toUpperCase()),
      ];
      const match = candidates.find((candidate) => fs.existsSync(candidate));
      if (match) {
        return match;
      }
    }
  }
  return "";
}

function existingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function copyDirectory(source, target) {
  fs.rmSync(target, { force: true, recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function run(command, argsToRun, opts = {}) {
  const result = spawnSync(command, argsToRun, {
    cwd: opts.cwd || projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${argsToRun.join(" ")} failed`);
  }
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        download(response.headers.location, destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
    });
    request.on("error", reject);
  });
}

async function buildPrimer3FromSource() {
  const canCrossBuildDarwinX64 =
    process.platform === "darwin" &&
    process.arch === "arm64" &&
    targetPlatformArch === "darwin-x64";
  const canCrossBuildWin32X64 =
    process.platform === "linux" &&
    process.arch === "x64" &&
    targetPlatformArch === "win32-x64";

  if (
    targetPlatformArch !== currentPlatformArch &&
    !canCrossBuildDarwinX64 &&
    !canCrossBuildWin32X64
  ) {
    throw new Error(
      `Cannot build ${targetPlatformArch} from this ${currentPlatformArch} host. Build Primer3 on the target platform, or provide PRIMER3_CORE_PATH and PRIMER3_CONFIG_PATH with PRIMER3_PLATFORM_ARCH=${targetPlatformArch}.`
    );
  }

  const archivePath = path.join(cacheDir, `primer3-${primer3Version}.tar.gz`);
  const sourceDir = path.join(cacheDir, `primer3-${primer3Version}`);
  const stageDir = path.join(cacheDir, `stage-${targetPlatformArch}`);

  if (!fs.existsSync(archivePath)) {
    console.info(`Downloading Primer3 ${primer3Version} from ${primer3SourceUrl}`);
    await download(primer3SourceUrl, archivePath);
  }

  fs.rmSync(sourceDir, { force: true, recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  run("tar", ["-xzf", archivePath, "--strip-components=1", "-C", sourceDir]);

  fs.rmSync(stageDir, { force: true, recursive: true });
  fs.mkdirSync(stageDir, { recursive: true });
  const makeArgs = ["-C", "src", "install", `PREFIX=${stageDir}`];
  if (canCrossBuildDarwinX64) {
    const sdkPath = spawnSync("xcrun", ["--show-sdk-path"], {
      encoding: "utf8",
    }).stdout.trim();
    const sdkFlags = `-arch x86_64 -isysroot ${sdkPath} -I${sdkPath}/usr/include/c++/v1`;
    makeArgs.push(
      "CC=clang",
      "CXX=clang++",
      `CC_OPTS=-g -Wall ${sdkFlags}`,
      "O_OPTS=-O2",
      `CFLAGS=-g -Wall -O2 ${sdkFlags}`,
      `CXXFLAGS=-g -Wall -O2 ${sdkFlags} -std=c++11`,
      `LDFLAGS=-g -arch x86_64 -isysroot ${sdkPath}`
    );
  }
  if (targetPlatform === "win32") {
    makeArgs.push(
      "TESTOPTS=--windows",
      "CC=x86_64-w64-mingw32-gcc",
      "CXX=x86_64-w64-mingw32-g++",
      "AR=x86_64-w64-mingw32-ar",
      "RANLIB=x86_64-w64-mingw32-ranlib"
    );
  }
  run("make", makeArgs, { cwd: sourceDir });

  return {
    core: path.join(stageDir, "bin", exeName),
    config: existingPath([
      path.join(stageDir, "share", "primer3", "primer3_config"),
      path.join(sourceDir, "src", "primer3_config"),
    ]),
    license: existingPath([
      path.join(sourceDir, "LICENSE"),
      path.join(stageDir, "LICENSE"),
    ]),
  };
}

function findInstalledPrimer3() {
  if (targetPlatformArch !== currentPlatformArch && !process.env.PRIMER3_CORE_PATH) {
    throw new Error(
      `Refusing to copy a ${currentPlatformArch} primer3_core into ${targetPlatformArch}. Set PRIMER3_CORE_PATH, PRIMER3_CONFIG_PATH, and PRIMER3_PLATFORM_ARCH for the target binary.`
    );
  }

  const primer3CorePath = existingPath([
    process.env.PRIMER3_CORE_PATH,
    commandPath(exeName),
    process.platform === "darwin" && process.arch === "arm64"
      ? "/opt/homebrew/bin/primer3_core"
      : "",
    process.platform === "darwin" ? "/usr/local/bin/primer3_core" : "",
  ]);

  const primer3ConfigPath = existingPath([
    process.env.PRIMER3_CONFIG_PATH,
    process.platform === "darwin" && process.arch === "arm64"
      ? "/opt/homebrew/share/primer3/primer3_config"
      : "",
    process.platform === "darwin" ? "/usr/local/share/primer3/primer3_config" : "",
    "/usr/share/primer3/primer3_config",
    "/usr/local/share/primer3/primer3_config",
  ]);

  const primer3LicensePath = existingPath([
    process.env.PRIMER3_LICENSE_PATH,
    path.join(path.dirname(path.dirname(primer3CorePath || "")), "LICENSE"),
    process.platform === "darwin" && process.arch === "arm64"
      ? `/opt/homebrew/Cellar/primer3/${primer3Version}/LICENSE`
      : "",
    process.platform === "darwin"
      ? `/usr/local/Cellar/primer3/${primer3Version}/LICENSE`
      : "",
  ]);

  if (!primer3CorePath) {
    throw new Error(
      "Could not find primer3_core. Install Primer3, set PRIMER3_CORE_PATH, or run `yarn prepare-primer3:source`."
    );
  }

  if (!primer3ConfigPath) {
    throw new Error(
      "Could not find primer3_config. Install Primer3 or set PRIMER3_CONFIG_PATH."
    );
  }

  return {
    core: primer3CorePath,
    config: primer3ConfigPath,
    license: primer3LicensePath,
  };
}

async function main() {
  const primer3 = fromSource ? await buildPrimer3FromSource() : findInstalledPrimer3();

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(primer3.core, targetExe);
  fs.chmodSync(targetExe, 0o755);
  copyDirectory(primer3.config, targetConfig);
  if (primer3.license) {
    fs.copyFileSync(primer3.license, targetLicense);
  }

  console.info(`Prepared Primer3 ${primer3Version} for ${targetPlatformArch}:`);
  console.info(`  ${targetExe}`);
  console.info(`  ${targetConfig}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
