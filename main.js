/* eslint-disable no-console*/
// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const bioParsers = require("bio-parsers");
const fs = require("fs");
const { spawn } = require("child_process");
const createMenu = require("./src/main_utils/menu");
const windowStateKeeper = require("electron-window-state");
const { autoUpdater } = require("electron-updater");

let isAppReady = false;
let isMacOpenTriggered = false;
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
const windows = [];
createMenu({ windows, createWindow, getSeqJsonFromPath });

function getPrimer3CoreCandidates() {
  const exeName = process.platform === "win32" ? "primer3_core.exe" : "primer3_core";
  const platformArch = `${process.platform}-${process.arch}`;
  const candidates = [
    process.env.PRIMER3_CORE_PATH,
  ];
  if (app.isPackaged) {
    candidates.push(
      path.join(process.resourcesPath || "", "bin", "primer3", platformArch, exeName),
      path.join(process.resourcesPath || "", "bin", exeName)
    );
  } else {
    candidates.push(
      path.join(__dirname, "bin", "primer3", platformArch, exeName),
      path.join(__dirname, "bin", exeName)
    );
  }
  candidates.push(
    path.join("/opt/homebrew/bin", exeName),
    path.join("/usr/local/bin", exeName),
    exeName
  );
  return candidates.filter(Boolean);
}

function getPrimer3ConfigPath() {
  const platformArch = `${process.platform}-${process.arch}`;
  const candidates = [
    process.env.PRIMER3_CONFIG_PATH,
  ];
  if (app.isPackaged) {
    candidates.push(
      path.join(process.resourcesPath || "", "bin", "primer3", platformArch, "primer3_config"),
      path.join(process.resourcesPath || "", "bin", "primer3_config")
    );
  } else {
    candidates.push(
      path.join(__dirname, "bin", "primer3", platformArch, "primer3_config"),
      path.join(__dirname, "primer3_config"),
      path.join(__dirname, "bin", "primer3_config")
    );
  }
  candidates.push(
    "/opt/homebrew/share/primer3/primer3_config",
    "/usr/local/share/primer3/primer3_config"
  );
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function buildPrimer3Input({
  sequence,
  sequenceId,
  target,
  includedRegion,
  task,
  size,
  tm,
  gc,
  productSizeRange,
  numReturn,
}) {
  const pickLeft = task === "both" || task === "forward";
  const pickRight = task === "both" || task === "reverse";
  const configPath = getPrimer3ConfigPath();
  const lines = [
    `SEQUENCE_ID=${sequenceId || "ove_primer_design"}`,
    `SEQUENCE_TEMPLATE=${sequence}`,
    "PRIMER_TASK=generic",
    `PRIMER_PICK_LEFT_PRIMER=${pickLeft ? 1 : 0}`,
    `PRIMER_PICK_RIGHT_PRIMER=${pickRight ? 1 : 0}`,
    "PRIMER_PICK_INTERNAL_OLIGO=0",
    "PRIMER_EXPLAIN_FLAG=1",
    `PRIMER_NUM_RETURN=${numReturn || 5}`,
    `PRIMER_MIN_SIZE=${size.min}`,
    `PRIMER_OPT_SIZE=${size.opt}`,
    `PRIMER_MAX_SIZE=${size.max}`,
    `PRIMER_MIN_TM=${tm.min}`,
    `PRIMER_OPT_TM=${tm.opt}`,
    `PRIMER_MAX_TM=${tm.max}`,
    `PRIMER_MIN_GC=${gc.min}`,
    `PRIMER_OPT_GC_PERCENT=${gc.opt}`,
    `PRIMER_MAX_GC=${gc.max}`,
  ];

  if (configPath) {
    lines.push(`PRIMER_THERMODYNAMIC_PARAMETERS_PATH=${configPath}`);
  }
  if (pickLeft && pickRight) {
    lines.push(`PRIMER_PRODUCT_SIZE_RANGE=${productSizeRange}`);
  }
  if (target && Number.isFinite(target.start) && Number.isFinite(target.length)) {
    lines.push(`SEQUENCE_TARGET=${target.start},${target.length}`);
  }
  if (
    includedRegion &&
    Number.isFinite(includedRegion.start) &&
    Number.isFinite(includedRegion.length)
  ) {
    lines.push(`SEQUENCE_INCLUDED_REGION=${includedRegion.start},${includedRegion.length}`);
  }

  lines.push("=");
  return lines.join("\n") + "\n";
}

function parsePrimer3Output(output) {
  const values = {};
  output
    .split(/\r?\n/)
    .filter((line) => line && line !== "=")
    .forEach((line) => {
      const index = line.indexOf("=");
      if (index > -1) {
        values[line.slice(0, index)] = line.slice(index + 1);
      }
    });

  const maxResults = Math.max(
    Number(values.PRIMER_PAIR_NUM_RETURNED || 0),
    Number(values.PRIMER_LEFT_NUM_RETURNED || 0),
    Number(values.PRIMER_RIGHT_NUM_RETURNED || 0)
  );
  const results = [];
  for (let i = 0; i < maxResults; i += 1) {
    const leftPosition = values[`PRIMER_LEFT_${i}`];
    const rightPosition = values[`PRIMER_RIGHT_${i}`];
    const [leftStart, leftLength] = (leftPosition || "").split(",").map(Number);
    const [rightStart, rightLength] = (rightPosition || "").split(",").map(Number);
    results.push({
      index: i + 1,
      penalty: values[`PRIMER_PAIR_${i}_PENALTY`],
      productSize: values[`PRIMER_PAIR_${i}_PRODUCT_SIZE`],
      forward: values[`PRIMER_LEFT_${i}_SEQUENCE`]
        ? {
            sequence: values[`PRIMER_LEFT_${i}_SEQUENCE`],
            tm: values[`PRIMER_LEFT_${i}_TM`],
            gc: values[`PRIMER_LEFT_${i}_GC_PERCENT`],
            start: Number.isFinite(leftStart) ? leftStart + 1 : undefined,
            length: Number.isFinite(leftLength) ? leftLength : undefined,
          }
        : null,
      reverse: values[`PRIMER_RIGHT_${i}_SEQUENCE`]
        ? {
            sequence: values[`PRIMER_RIGHT_${i}_SEQUENCE`],
            tm: values[`PRIMER_RIGHT_${i}_TM`],
            gc: values[`PRIMER_RIGHT_${i}_GC_PERCENT`],
            start: Number.isFinite(rightStart) ? rightStart + 1 : undefined,
            length: Number.isFinite(rightLength) ? rightLength : undefined,
          }
        : null,
    });
  }

  return {
    values,
    results,
    error: values.PRIMER_ERROR,
    explain: {
      pair: values.PRIMER_PAIR_EXPLAIN,
      left: values.PRIMER_LEFT_EXPLAIN,
      right: values.PRIMER_RIGHT_EXPLAIN,
    },
  };
}

function runPrimer3Core(input) {
  const candidates = getPrimer3CoreCandidates();
  let candidateIndex = 0;

  return new Promise((resolve, reject) => {
    const tryNextCandidate = () => {
      const candidate = candidates[candidateIndex];
      candidateIndex += 1;
      if (!candidate) {
        reject(
          new Error(
            "primer3_core was not found. Install primer3_core and make it available on PATH, set PRIMER3_CORE_PATH, or place it in ./bin."
          )
        );
        return;
      }

      const child = spawn(candidate, [], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let didSpawn = false;
      let settled = false;

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("spawn", () => {
        didSpawn = true;
        child.stdin.end(input);
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if ((error.code === "ENOENT" || error.code === "ENOTDIR") && !didSpawn) {
          tryNextCandidate();
          return;
        }
        reject(error);
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code === 0) {
          resolve({ stdout, stderr, binaryPath: candidate });
          return;
        }
        if (!didSpawn) {
          tryNextCandidate();
          return;
        }
        reject(new Error(stderr || `primer3_core exited with code ${code}`));
      });
    };

    tryNextCandidate();
  });
}

async function getSeqJsonFromPath(_filePath) {
  const filePath = _filePath || process.argv[1];
  // const filePath = _filePath || process.argv[2] || process.argv[1];
  if (filePath === ".") return;
  const data = fs.readFileSync(path.resolve(filePath));
  //open, read, handle file
  if (!data) return;
  const fileName = filePath.replace(/^.*[\\/]/, "");
  try {
    if (fileName.endsWith(".json") && (data.sequence || data.proteinSequence)) {
      return data;
    }
    const res = await bioParsers.anyToJson(data, { fileName });
    return res[0].parsedSequence;
  } catch (error) {
    console.error(`error:`, error);
    return {};
  }
}

function waitTillAppReady() {
  return new Promise((resolve, reject) => {
    const waitTillReadyInterval = setInterval(() => {
      if (isAppReady) {
        resolve();
        clearInterval(waitTillReadyInterval);
      }
    }, 100);
  });
}

async function createWindow({ initialSeqJson, filePath, windowToUse } = {}) {
  await waitTillAppReady();
  //if no windowVars are passed then we should
  // Create the browser window.

  if (filePath) {
    let alreadyOpen = false;
    windows.forEach((w) => {
      if (w.__filePath === filePath) {
        w.bw.show();
        alreadyOpen = true;
      }
    });
    if (alreadyOpen) {
      return;
    }
  }
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 800,
  });

  let newWindow =
    windowToUse ||
    new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      show: false,
      webPreferences: {
        contextIsolation: true,
        // nodeIntegration: true, //we don't want to enable this because it is a security risk and slows down the app
        preload: path.join(__dirname, "src/preload.js"),
      },
    });

  newWindow.once("ready-to-show", () => {
    newWindow.show();
  });

  // Let us register listeners on the window, so we can update the state
  // automatically (the listeners will be removed when the window is closed)
  // and restore the maximized or full screen state
  mainWindowState.manage(newWindow);

  !windowToUse &&
    windows.push({
      bw: newWindow,
      //set a __filePath property so we can reference this if a user tries to open the same file multiple times
      __filePath: filePath,
    });
console.log(`initialSeqJson:`,initialSeqJson)
  newWindow.loadFile("index.html", {
    query: { initialSeqJson: JSON.stringify(initialSeqJson), filePath },
  });

  // Open the DevTools.
  // newWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  newWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    let indexToSplice;
    windows.forEach((w, i) => {
      if (w.bw === newWindow) {
        indexToSplice = i;
      }
    });
    windows.splice(indexToSplice, 1);
    newWindow = null;
  });
}

app.on("open-file", async (event, path) => {
  isMacOpenTriggered = true;
  //mac only
  event.preventDefault();
  console.log(`open-file`)
  try {
    console.log("trying to open gb file");
    const initialSeqJson = await getSeqJsonFromPath(path);
    createWindow({ filePath: path, initialSeqJson });
  } catch (e) {
    console.error(`e73562891230:`, e);
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  console.info(`App Starting Up`);
  autoUpdater.checkForUpdatesAndNotify();
  isAppReady = true;
  if (!windows.length && !isMacOpenTriggered) {
    let initialSeqJson;
    if ( process.argv.length >= 2) {
      initialSeqJson = await getSeqJsonFromPath();
    }
    createWindow({ filePath: path, initialSeqJson });
  }
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!windows.length) {
    console.log(`onActivate`);
    createWindow();
  }
});

// ipcMain.on("restart_app", () => {
//   setImmediate(() => {
//     autoUpdater.quitAndInstall();
//   });
// });

/*  HANDLE THE API CALLS FROM THE RENDERER PROCESS  */

ipcMain.handle(
  "ove_saveFile",
  (event, { sequenceDataToSave, filePath, isSaveAs }) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);

    const ext = path.extname(filePath);

    let formattedSeqString;
    if (ext === ".fasta") {
      formattedSeqString = bioParsers.jsonToFasta(sequenceDataToSave);
    } else if (ext === ".bed") {
      formattedSeqString = bioParsers.jsonToBed(sequenceDataToSave);
    } else if (ext === ".json") {
      formattedSeqString = JSON.stringify(sequenceDataToSave, null, 2);
    } else {
      formattedSeqString = bioParsers.jsonToGenbank(sequenceDataToSave);
    }
    fs.writeFileSync(filePath, formattedSeqString);
    !isSaveAs &&
      windows.forEach((w) => {
        if (w.bw === browserWindow) {
          //update the __filePath prop we're saving on the window to prevent opening the same file twice
          w.__filePath = filePath;
        }
      });
  }
);

ipcMain.handle("ove_showSaveDialog", async (event, opts) => {
  return dialog.showSaveDialogSync(
    BrowserWindow.fromWebContents(event.sender),
    opts
  );
});

ipcMain.handle("ove_designPrimers", async (_event, request) => {
  const primer3Input = buildPrimer3Input(request);
  const { stdout, stderr, binaryPath } = await runPrimer3Core(primer3Input);
  const parsedOutput = parsePrimer3Output(stdout);
  return {
    ...parsedOutput,
    binaryPath,
    primer3Input,
    stderr,
    rawOutput: stdout,
  };
});

/*  **************************************************  */
