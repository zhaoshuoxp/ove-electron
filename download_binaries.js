const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', reject);
  });
}

async function main() {
  const platforms = ['win32-x64', 'linux-x64', 'linux-arm64'];
  for (const plat of platforms) {
    fs.mkdirSync(`bin/primer3/${plat}`, { recursive: true });
  }

  // Windows
  console.log('Downloading Windows binary...');
  await download('https://github.com/primer3-org/primer3/releases/download/v2.6.1/primer3-2.6.1_exe_for_windows.zip', 'win.zip');
  execSync('unzip -q -o win.zip');
  fs.copyFileSync('primer3-2.6.1_exe_for_windows/primer3_core.exe', 'bin/primer3/win32-x64/primer3_core.exe');
  fs.cpSync('primer3-2.6.1_exe_for_windows/primer3_config', 'bin/primer3/win32-x64/primer3_config', { recursive: true });

  // Linux x64
  console.log('Downloading Linux x64 binary...');
  await download('https://anaconda.org/bioconda/primer3/2.6.1/download/linux-64/primer3-2.6.1-h9f5acd7_0.tar.bz2', 'linux.tar.bz2');
  fs.mkdirSync('linux_tmp', { recursive: true });
  execSync('tar -xjf linux.tar.bz2 -C linux_tmp');
  fs.copyFileSync('linux_tmp/bin/primer3_core', 'bin/primer3/linux-x64/primer3_core');
  
  const linuxConfigPath = fs.readdirSync('linux_tmp/share/').find(d => d.startsWith('primer3'));
  fs.cpSync(`linux_tmp/share/${linuxConfigPath}/primer3_config`, 'bin/primer3/linux-x64/primer3_config', { recursive: true });

  // Linux arm64
  console.log('Downloading Linux arm64 binary...');
  await download('https://anaconda.org/bioconda/primer3/2.6.1/download/linux-aarch64/primer3-2.6.1-h7c73db8_0.tar.bz2', 'linux-arm.tar.bz2');
  fs.mkdirSync('linux_arm_tmp', { recursive: true });
  execSync('tar -xjf linux-arm.tar.bz2 -C linux_arm_tmp');
  fs.copyFileSync('linux_arm_tmp/bin/primer3_core', 'bin/primer3/linux-arm64/primer3_core');
  
  const linuxArmConfigPath = fs.readdirSync('linux_arm_tmp/share/').find(d => d.startsWith('primer3'));
  fs.cpSync(`linux_arm_tmp/share/${linuxArmConfigPath}/primer3_config`, 'bin/primer3/linux-arm64/primer3_config', { recursive: true });

  console.log('Done!');
}

main().catch(console.error);
