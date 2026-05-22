// This window.initialSeqJson is getting set in preload from the query string from the main process load() call
const seqDataToUse = window.initialSeqJson || { circular: true };
// export default generateSequenceData()
const originalTitle = document.title;

let axisFontScalePercent = 100;

const circularViewStyleId = "ove-circular-view-dynamic-style";
const axisScalePercents = [33, 50, 75, 100, 125, 150, 200];
const axisScaleStorageKey = "oveAxisFontScalePercent";
const primerDesignPanelId = "primerDesign";
const primerDesignPanelName = "Primer Design";

setNewTitle(seqDataToUse.name);

function setNewTitle(name) {
  document.title = originalTitle + " -- " + (name || "Untitled Sequence");
}

function updateCircularViewStyles() {
  let styleEl = document.getElementById(circularViewStyleId);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = circularViewStyleId;
    document.head.appendChild(styleEl);
  }

  const scaledAxisFontSize = Math.max(
    6,
    Math.round((12 * axisFontScalePercent) / 100)
  );

  styleEl.textContent = `
    .veCircularView .veAxis text,
    .veCircularView g[class*="axis"] text,
    .veCircularView g[class*="Axis"] text,
    .veCircularView text[class*="axis"],
    .veCircularView text[class*="Axis"] {
      font-size: ${scaledAxisFontSize}px !important;
    }

    .veCircularView {
      background: transparent !important;
      border: none !important;
    }
  `;
}

function setAxisFontScalePercent(percent) {
  const nextValue = Number(percent);
  if (!Number.isFinite(nextValue)) {
    return;
  }
  if (!axisScalePercents.includes(nextValue)) {
    return;
  }
  axisFontScalePercent = nextValue;
  window.localStorage.setItem(axisScaleStorageKey, String(axisFontScalePercent));
  updateCircularViewStyles();
}

function restoreAxisFontScalePercent() {
  const stored = Number(window.localStorage.getItem(axisScaleStorageKey));
  if (axisScalePercents.includes(stored)) {
    axisFontScalePercent = stored;
  }
}

function refreshAxisScaleMenuSelection() {
  if (!editor) {
    return;
  }
  editor.updateEditor({
    menuFilter: applyMenuFilters,
  });
}

function buildAxisFontScaleMenuItem() {
  return {
    axisFontScaleMenu: true,
    text: "Axis Font Scale",
    submenu: axisScalePercents.map((percent) => ({
      text: `${percent}%`,
      shouldDismissPopover: true,
      checked: axisFontScalePercent === percent,
      onClick: () => {
        setAxisFontScalePercent(percent);
        refreshAxisScaleMenuSelection();
      },
    })),
  };
}

function insertAxisScaleIntoLabelsMenu(menuDef) {
  const viewMenu = (menuDef || []).find((item) => item && item.text === "View");
  if (!viewMenu || !Array.isArray(viewMenu.submenu)) {
    return menuDef;
  }

  const labelsMenu = viewMenu.submenu.find(
    (item) => item && item.text === "Labels"
  );
  if (!labelsMenu || !Array.isArray(labelsMenu.submenu)) {
    return menuDef;
  }

  const existingIndex = labelsMenu.submenu.findIndex(
    (item) => item && item.axisFontScaleMenu
  );
  const labelSizeIndex = labelsMenu.submenu.findIndex(
    (item) => item && item.cmd === "adjustLabelSize"
  );

  const axisMenuItem = buildAxisFontScaleMenuItem();
  if (existingIndex > -1) {
    labelsMenu.submenu[existingIndex] = axisMenuItem;
    return menuDef;
  }

  if (labelSizeIndex > -1) {
    labelsMenu.submenu.splice(labelSizeIndex + 1, 0, axisMenuItem);
  } else {
    labelsMenu.submenu.push(axisMenuItem);
  }

  return menuDef;
}

function insertPrimerDesignIntoToolsMenu(menuDef) {
  const toolsMenu = (menuDef || []).find(
    (item) => item && item.text === "Tools"
  );
  if (!toolsMenu || !Array.isArray(toolsMenu.submenu)) {
    return menuDef;
  }

  const existingIndex = toolsMenu.submenu.findIndex(
    (item) => item && item.primerDesignMenuItem
  );
  const primerDesignItem = {
    primerDesignMenuItem: true,
    text: primerDesignPanelName,
    shouldDismissPopover: true,
    onClick: openPrimerDesignPanel,
  };

  if (existingIndex > -1) {
    toolsMenu.submenu[existingIndex] = primerDesignItem;
  } else {
    toolsMenu.submenu.push(primerDesignItem);
  }

  return menuDef;
}

function applyMenuFilters(menuDef) {
  return insertPrimerDesignIntoToolsMenu(
    insertAxisScaleIntoLabelsMenu(menuDef)
  );
}

function buildPanelsShown(activePanelId) {
  const primerIsActive = activePanelId === primerDesignPanelId;
  const circularIsActive = activePanelId === "circular";
  const railIsActive = activePanelId === "rail";
  const topPanels = [
    {
      active: circularIsActive,
      id: "circular",
      name: "Circular Map",
    },
    {
      id: "rail",
      name: "Linear Map",
      active: railIsActive,
    },
  ];

  if (primerIsActive) {
    topPanels.push({
      id: primerDesignPanelId,
      name: primerDesignPanelName,
      active: true,
    });
  }

  return [
    topPanels,
    [
      {
        id: "sequence",
        name: "Sequence Map",
        active: true,
      },

      {
        id: "properties",
        name: "Properties",
      },
    ],
  ];
}

function getCurrentSequence() {
  try {
    const state = editor && editor.getState && editor.getState();
    return (state && state.sequenceData && state.sequenceData.sequence) || "";
  } catch (error) {
    console.error("Unable to read sequence for primer design:", error);
    return "";
  }
}

function getCurrentSequenceData() {
  try {
    const state = editor && editor.getState && editor.getState();
    return (state && state.sequenceData) || seqDataToUse || {};
  } catch (error) {
    console.error("Unable to read sequence data for primer design:", error);
    return seqDataToUse || {};
  }
}

function normalizeDnaSequence(sequence) {
  return String(sequence || "")
    .replace(/[^a-zA-Z]/g, "")
    .replace(/[^ACGTNacgtn]/g, "N")
    .toUpperCase();
}

function getRangeSequence(sequence, start, end, isCircular) {
  const normalized = normalizeDnaSequence(sequence);
  const sequenceLength = normalized.length;
  const startIndex = Math.max(0, Number(start) - 1);
  const endIndex = Math.max(0, Number(end) - 1);

  if (!sequenceLength || startIndex >= sequenceLength || endIndex >= sequenceLength) {
    return "";
  }
  if (startIndex <= endIndex) {
    return normalized.slice(startIndex, endIndex + 1);
  }
  if (isCircular) {
    return normalized.slice(startIndex) + normalized.slice(0, endIndex + 1);
  }
  return "";
}

function getSelectedSequenceInfo() {
  const sequenceData = getCurrentSequenceData();
  const sequence = sequenceData.sequence || "";
  const state = editor && editor.getState && editor.getState();
  const selectionLayer = state && state.selectionLayer;

  if (
    !selectionLayer ||
    !Number.isFinite(selectionLayer.start) ||
    !Number.isFinite(selectionLayer.end)
  ) {
    return null;
  }

  const start = Number(selectionLayer.start) + 1;
  const end = Number(selectionLayer.end) + 1;
  const selectedSequence = getRangeSequence(sequence, start, end, sequenceData.circular);
  if (!selectedSequence) {
    return null;
  }

  return {
    sequence: selectedSequence,
    start,
    end,
  };
}

function setPrimerDesignStatus(message, isError) {
  const panel = createPrimerDesignPanel();
  const status = panel.querySelector("#primer-design-status");
  status.textContent = message || "";
  status.classList.toggle("primerDesignStatus--error", !!isError);
}

function getPrimerDesignNumber(panel, id) {
  const value = Number(panel.querySelector(`#${id}`).value);
  return Number.isFinite(value) ? value : undefined;
}

function getPrimerDesignParams() {
  const panel = createPrimerDesignPanel();
  const sequence = normalizeDnaSequence(
    panel.querySelector("#primer-design-template").value
  );
  const task = panel.querySelector("input[name='primer-design-task']:checked").value;
  const productSizeRange =
    panel.querySelector("#primer-design-product-size").value.trim() || "100-300";

  return {
    sequence,
    sequenceId:
      panel.querySelector("#primer-design-sequence-id").value.trim() ||
      "ove_primer_design",
    task,
    productSizeRange,
    numReturn: getPrimerDesignNumber(panel, "primer-design-num-return") || 5,
    size: {
      min: getPrimerDesignNumber(panel, "primer-design-size-min"),
      opt: getPrimerDesignNumber(panel, "primer-design-size-opt"),
      max: getPrimerDesignNumber(panel, "primer-design-size-max"),
    },
    tm: {
      min: getPrimerDesignNumber(panel, "primer-design-tm-min"),
      opt: getPrimerDesignNumber(panel, "primer-design-tm-opt"),
      max: getPrimerDesignNumber(panel, "primer-design-tm-max"),
    },
    gc: {
      min: getPrimerDesignNumber(panel, "primer-design-gc-min"),
      opt: getPrimerDesignNumber(panel, "primer-design-gc-opt"),
      max: getPrimerDesignNumber(panel, "primer-design-gc-max"),
    },
  };
}

function validatePrimerDesignParams(params) {
  if (!params.sequence) {
    return "Please provide a template sequence, use the current selection, or load a vector coordinate range.";
  }
  if (params.sequence.length < 20) {
    return "Template sequence is too short for Primer3.";
  }

  const triples = [
    ["Primer length", params.size],
    ["Tm", params.tm],
    ["GC%", params.gc],
  ];
  for (const [label, values] of triples) {
    if (![values.min, values.opt, values.max].every(Number.isFinite)) {
      return `${label} min, opt, and max values are required.`;
    }
    if (values.min > values.opt || values.opt > values.max) {
      return `${label} values must be ordered as min <= opt <= max.`;
    }
  }

  if (params.task === "both" && !/^\d+\s*-\s*\d+(\s+\d+\s*-\s*\d+)*$/.test(params.productSizeRange)) {
    return "Product size range must look like 100-300, or multiple ranges separated by spaces.";
  }

  return "";
}

function copyPrimerResultSequence(event) {
  const sequence = event.target.getAttribute("data-primer-sequence");
  if (!sequence) {
    return;
  }
  navigator.clipboard.writeText(sequence);
  setPrimerDesignStatus("Primer sequence copied.");
}

function renderPrimerDesignResults(response) {
  const panel = createPrimerDesignPanel();
  const resultsNode = panel.querySelector("#primer-design-results");

  if (response.error) {
    resultsNode.innerHTML = `<div class="primerDesignEmptyResult"></div>`;
    resultsNode.querySelector(".primerDesignEmptyResult").textContent =
      response.error;
    setPrimerDesignStatus(response.error, true);
    return;
  }

  if (!response.results || !response.results.length) {
    resultsNode.innerHTML = `
      <div class="primerDesignEmptyResult">
        Primer3 did not return primers for these constraints.
      </div>
    `;
    const explain = response.explain || {};
    setPrimerDesignStatus(
      [explain.left, explain.right, explain.pair].filter(Boolean).join(" | "),
      true
    );
    return;
  }

  resultsNode.innerHTML = response.results
    .map((result) => {
      const forward = result.forward;
      const reverse = result.reverse;
      return `
        <article class="primerDesignResult">
          <div class="primerDesignResult__summary">
            <strong>#${result.index}</strong>
            ${
              result.productSize
                ? `<span>Product ${result.productSize} bp</span>`
                : ""
            }
            ${result.penalty ? `<span>Penalty ${result.penalty}</span>` : ""}
          </div>
          ${
            forward
              ? `
                <div class="primerDesignResult__primer">
                  <span>Forward</span>
                  <code>${forward.sequence}</code>
                  <small>Tm ${Number(forward.tm).toFixed(2)} | GC ${Number(
                  forward.gc
                ).toFixed(2)}% | ${forward.start || ""}:${
                  forward.length || ""
                }</small>
                  <button type="button" data-primer-sequence="${
                    forward.sequence
                  }">Copy</button>
                </div>
              `
              : ""
          }
          ${
            reverse
              ? `
                <div class="primerDesignResult__primer">
                  <span>Reverse</span>
                  <code>${reverse.sequence}</code>
                  <small>Tm ${Number(reverse.tm).toFixed(2)} | GC ${Number(
                  reverse.gc
                ).toFixed(2)}% | ${reverse.start || ""}:${
                  reverse.length || ""
                }</small>
                  <button type="button" data-primer-sequence="${
                    reverse.sequence
                  }">Copy</button>
                </div>
              `
              : ""
          }
        </article>
      `;
    })
    .join("");

  resultsNode.querySelectorAll("[data-primer-sequence]").forEach((button) => {
    button.addEventListener("click", copyPrimerResultSequence);
  });
  setPrimerDesignStatus(`Primer3 returned ${response.results.length} result(s).`);
}

function loadPrimerDesignSelection() {
  const panel = createPrimerDesignPanel();
  const selected = getSelectedSequenceInfo();
  if (!selected) {
    setPrimerDesignStatus(
      "No active sequence selection found. Paste a sequence or load one from vector coordinates.",
      true
    );
    return;
  }

  panel.querySelector("#primer-design-template").value = selected.sequence;
  panel.querySelector("#primer-design-coordinate-start").value = selected.start;
  panel.querySelector("#primer-design-coordinate-end").value = selected.end;
  setPrimerDesignStatus(
    `Loaded selected range ${selected.start}-${selected.end} (${selected.sequence.length} bp).`
  );
}

function loadPrimerDesignCoordinates() {
  const panel = createPrimerDesignPanel();
  const sequenceData = getCurrentSequenceData();
  const start = getPrimerDesignNumber(panel, "primer-design-coordinate-start");
  const end = getPrimerDesignNumber(panel, "primer-design-coordinate-end");
  const selectedSequence = getRangeSequence(
    sequenceData.sequence,
    start,
    end,
    sequenceData.circular
  );

  if (!selectedSequence) {
    setPrimerDesignStatus("Unable to load that coordinate range from the vector.", true);
    return;
  }

  panel.querySelector("#primer-design-template").value = selectedSequence;
  setPrimerDesignStatus(
    `Loaded vector range ${start}-${end} (${selectedSequence.length} bp).`
  );
}

function loadPrimerDesignFullVector() {
  const panel = createPrimerDesignPanel();
  const sequence = normalizeDnaSequence(getCurrentSequence());
  panel.querySelector("#primer-design-template").value = sequence;
  panel.querySelector("#primer-design-coordinate-start").value = sequence ? 1 : "";
  panel.querySelector("#primer-design-coordinate-end").value = sequence.length || "";
  setPrimerDesignStatus(`Loaded full vector (${sequence.length} bp).`);
}

async function designPrimersWithPrimer3() {
  const panel = createPrimerDesignPanel();
  const generateButton = panel.querySelector("#primer-design-generate");
  const params = getPrimerDesignParams();
  const validationError = validatePrimerDesignParams(params);
  if (validationError) {
    setPrimerDesignStatus(validationError, true);
    return;
  }

  generateButton.disabled = true;
  setPrimerDesignStatus("Running primer3_core...");
  try {
    const response = await window.api.send("ove_designPrimers", params);
    renderPrimerDesignResults(response);
  } catch (error) {
    setPrimerDesignStatus(error.message || "Primer3 failed.", true);
  } finally {
    generateButton.disabled = false;
  }
}

function createPrimerDesignPanel() {
  let panel = document.getElementById("primer-design-panel");
  if (panel) {
    return panel;
  }

  panel = document.createElement("section");
  panel.id = "primer-design-panel";
  panel.className = "primerDesignPanel hidden";
  panel.innerHTML = `
    <div class="primerDesignPanel__header">
      <h1>${primerDesignPanelName}</h1>
      <button class="primerDesignPanel__close" type="button" aria-label="Close Primer Design">Close</button>
    </div>
    <div class="primerDesignPanel__body">
      <div class="primerDesignSection primerDesignSection--sequence">
        <label class="primerDesignField primerDesignField--wide">
          <span>Template Sequence</span>
          <textarea id="primer-design-template" rows="8" spellcheck="false"></textarea>
        </label>
        <div class="primerDesignActions">
          <button id="primer-design-use-selection" type="button">Use Selection</button>
          <button id="primer-design-use-full-vector" type="button">Use Full Vector</button>
        </div>
        <div class="primerDesignCoordinateRow">
          <label class="primerDesignField">
            <span>Vector Start</span>
            <input id="primer-design-coordinate-start" type="number" min="1" />
          </label>
          <label class="primerDesignField">
            <span>Vector End</span>
            <input id="primer-design-coordinate-end" type="number" min="1" />
          </label>
          <button id="primer-design-load-coordinates" type="button">Load Range</button>
        </div>
        <label class="primerDesignField primerDesignField--wide">
          <span>Sequence Id</span>
          <input id="primer-design-sequence-id" type="text" value="ove_primer_design" />
        </label>
      </div>

      <div class="primerDesignSection">
        <h2>Design Mode</h2>
        <div class="primerDesignChoices">
          <label><input type="radio" name="primer-design-task" value="both" checked /> Pair</label>
          <label><input type="radio" name="primer-design-task" value="forward" /> Forward only</label>
          <label><input type="radio" name="primer-design-task" value="reverse" /> Reverse only</label>
        </div>
        <label class="primerDesignField">
          <span>Number To Return</span>
          <input id="primer-design-num-return" type="number" min="1" max="50" value="5" />
        </label>
        <label class="primerDesignField">
          <span>Product Size Range</span>
          <input id="primer-design-product-size" type="text" value="100-300" />
        </label>
      </div>

      <div class="primerDesignSection primerDesignSection--parameters">
        <h2>Parameters</h2>
        <div class="primerDesignTripleHeader">
          <span></span><span>Min</span><span>Opt</span><span>Max</span>
        </div>
        <div class="primerDesignTriple">
          <span>Primer Length</span>
          <input id="primer-design-size-min" type="number" min="1" value="18" />
          <input id="primer-design-size-opt" type="number" min="1" value="20" />
          <input id="primer-design-size-max" type="number" min="1" value="27" />
        </div>
        <div class="primerDesignTriple">
          <span>Tm</span>
          <input id="primer-design-tm-min" type="number" step="0.1" value="57" />
          <input id="primer-design-tm-opt" type="number" step="0.1" value="60" />
          <input id="primer-design-tm-max" type="number" step="0.1" value="63" />
        </div>
        <div class="primerDesignTriple">
          <span>GC%</span>
          <input id="primer-design-gc-min" type="number" step="0.1" value="20" />
          <input id="primer-design-gc-opt" type="number" step="0.1" value="50" />
          <input id="primer-design-gc-max" type="number" step="0.1" value="80" />
        </div>
      </div>

      <div class="primerDesignRunBar">
        <button id="primer-design-generate" class="primerDesignPanel__primary" type="button">Design Primers</button>
        <span id="primer-design-status" class="primerDesignStatus" aria-live="polite"></span>
      </div>

      <div id="primer-design-results" class="primerDesignResults" aria-live="polite">
        <div class="primerDesignEmptyResult">Primer3 results will appear here.</div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  panel
    .querySelector(".primerDesignPanel__close")
    .addEventListener("click", closePrimerDesignPanel);
  panel
    .querySelector("#primer-design-generate")
    .addEventListener("click", designPrimersWithPrimer3);
  panel
    .querySelector("#primer-design-use-selection")
    .addEventListener("click", loadPrimerDesignSelection);
  panel
    .querySelector("#primer-design-use-full-vector")
    .addEventListener("click", loadPrimerDesignFullVector);
  panel
    .querySelector("#primer-design-load-coordinates")
    .addEventListener("click", loadPrimerDesignCoordinates);

  return panel;
}

function populatePrimerDesignPanel() {
  const panel = createPrimerDesignPanel();
  const sequenceData = getCurrentSequenceData();
  const selected = getSelectedSequenceInfo();
  const templateInput = panel.querySelector("#primer-design-template");

  if (selected) {
    templateInput.value = selected.sequence;
    panel.querySelector("#primer-design-coordinate-start").value = selected.start;
    panel.querySelector("#primer-design-coordinate-end").value = selected.end;
    setPrimerDesignStatus(
      `Loaded selected range ${selected.start}-${selected.end} (${selected.sequence.length} bp).`
    );
  } else if (!templateInput.value) {
    panel.querySelector("#primer-design-coordinate-start").value = sequenceData.sequence
      ? 1
      : "";
    panel.querySelector("#primer-design-coordinate-end").value =
      (sequenceData.sequence && sequenceData.sequence.length) || "";
    setPrimerDesignStatus(
      "No active selection found. Paste a sequence, use the full vector, or load a coordinate range."
    );
  }
}

function openPrimerDesignPanel() {
  if (!editor) {
    return;
  }

  try {
    editor.updateEditor({
      panelsShown: buildPanelsShown(primerDesignPanelId),
    });
  } catch (error) {
    console.error("Unable to activate Primer Design tab:", error);
  }
  populatePrimerDesignPanel();
  createPrimerDesignPanel().classList.remove("hidden");
}

function closePrimerDesignPanel() {
  createPrimerDesignPanel().classList.add("hidden");
  editor.updateEditor({
    panelsShown: buildPanelsShown(
      seqDataToUse && seqDataToUse.circular ? "circular" : "rail"
    ),
  });
}

function hidePrimerDesignPanelWhenAnotherTabIsSelected(event) {
  const label = event.target && event.target.textContent;
  if (
    label &&
    label !== primerDesignPanelName &&
    ["Circular Map", "Linear Map", "Sequence Map", "Properties"].includes(
      label.trim()
    )
  ) {
    const panel = document.getElementById("primer-design-panel");
    if (panel) {
      panel.classList.add("hidden");
    }
  }
}

document.addEventListener(
  "click",
  hidePrimerDesignPanelWhenAnotherTabIsSelected,
  true
);

restoreAxisFontScalePercent();
updateCircularViewStyles();

const handleSave =
  (isSaveAs) =>
  async (event, sequenceDataToSave, editorProps, onSuccessCallback) => {
    const filters = [
      { name: "Genbank", extensions: ["gb"] },
      { name: "Fasta", extensions: ["fasta"] },
      { name: "TeselaGen JSON", extensions: ["json"] },
      { name: "Bed", extensions: ["bed"] },
    ];

    let nameToUse;
    let defaultPath = "~/Downloads/";
    if (window.filePath) {
      nameToUse = window.filePath.slice(window.filePath.lastIndexOf("/") + 1);
      defaultPath = window.filePath.slice(
        0,
        window.filePath.lastIndexOf("/") + 1
      );
    }
    //we need to get the newFilePath
    nameToUse =
      nameToUse || `${sequenceDataToSave.name || "Untitled_Sequence"}.gb`;
    const newFilePath = await window.api.send("ove_showSaveDialog", {
      filters,
      title: nameToUse,
      defaultPath: defaultPath + nameToUse,
      buttonLabel: `Save file ${isSaveAs ? "as" : ""}`,
    });

    if (!newFilePath) {
      return; //cancel the save!
    }

    sequenceDataToSave.name = newFilePath.slice(
      newFilePath.lastIndexOf("/") + 1
    );
    filters.forEach(({ extensions }) => {
      //strip the extension from the name
      sequenceDataToSave.name = sequenceDataToSave.name.replace(
        `.${extensions[0]}`,
        ""
      );
    });

    if (!isSaveAs) {
      setNewTitle(sequenceDataToSave.name);
      window.filePath = newFilePath;
      editor.updateEditor({
        //update the name of the seq without triggering the undo/redo stack tracking
        sequenceData: sequenceDataToSave,
      });
    }

    window.api.send("ove_saveFile", {
      filePath: newFilePath,
      sequenceDataToSave,
      isSaveAs,
    });
    onSuccessCallback();
    window.toastr.success(`Sequence Saved to ${newFilePath}`);
  };

const editor = window.createVectorEditor("createDomNodeForMe", {
  autoAnnotateFeatures: window._ove_addons.autoAnnotateFeatures,
  autoAnnotateParts: window._ove_addons.autoAnnotateParts,
  autoAnnotatePrimers: window._ove_addons.autoAnnotatePrimers,
  isFullscreen: true,
  showCicularViewInternalLabels: true,
  menuFilter: applyMenuFilters,
  // or you can pass "createDomNodeForMe" but make sure to use editor.close() to clean up the dom node!

  //you can also pass a DOM node as the first arg here
  // showReadOnly: false,
  // disableSetReadOnly: true,
  allowPrimerBasesToBeEdited: true,
  defaultLinkedOligoMessage: '',
  shouldAutosave: false,
  alwaysAllowSave: true,
  // rightClickOverrides: {
  //   selectionLayerRightClicked: (items /* { annotation }, props */) => {
  //     return [
  //       ...items,
  //       {
  //         text: "Create Part",
  //         onClick: () => console.info("hey!≈")
  //       }
  //     ];
  //   }
  // },
  // handleFullscreenClose: () => { //comment this function in to make the editor fullscreen by default
  //   editor.close() //this calls reactDom.unmountComponent at the node you passed as the first arg
  // },
  onRename: (newName) => {
    setNewTitle(newName);
  }, //this option should be shown by default
  // onNew: () => {}, //unless this callback is defined, don't show the option to create a new seq
  // onDuplicate: () => {}, //unless this callback is defined, don't show the option to create a new seq
  onSaveAs: handleSave(true),
  onSave: handleSave(),
  onImport: (sequenceData) => {
    try {
      editor.updateEditor({
        sequenceData,
      });
    } catch (error) {
      console.error(`error 129821:`, error);
    }
  },
  // onDelete: data => {
  //   console.warn("would delete", data);
  // },
  // onCopy: function(event, copiedSequenceData /* , editorState */) {
  //   //the copiedSequenceData is the subset of the sequence that has been copied in the teselagen sequence format
  //   const clipboardData = event.clipboardData;
  //   clipboardData.setData("text/plain", copiedSequenceData.sequence);
  //   clipboardData.setData(
  //     "application/json",
  //     //for example here you could change teselagen parts into jbei parts
  //     JSON.stringify(copiedSequenceData)
  //   );
  //   event.preventDefault();
  //   //in onPaste in your app you can do:
  //   // e.clipboardData.getData('application/json')
  // },
  // onPaste: function(event /* , editorState */) {
  //   //the onPaste here must return sequenceData in the teselagen data format
  //   const clipboardData = event.clipboardData;
  //   let jsonData = clipboardData.getData("application/json");
  //   if (jsonData) {
  //     jsonData = JSON.parse(jsonData);
  //     if (jsonData.isJbeiSeq) {
  //       jsonData = convertJbeiToTeselagen(jsonData);
  //     }
  //   }
  //   const sequenceData = jsonData || {
  //     sequence: clipboardData.getData("text/plain")
  //   };
  //   return sequenceData;
  // },
  // getSequenceAtVersion: versionId => {
  //   if (versionId === 2) {
  //     return {
  //       sequence: "thomaswashere"
  //     };
  //   } else if ((versionId = 3)) {
  //     return {
  //       features: [{ start: 4, end: 6 }],
  //       sequence:
  //         "GGGAAAagagagtgagagagtagagagagaccacaccccccGGGAAAagagagtgagagagtagagagagaccacaccccccGGGAAAagagagtgagagagtagagagagaccacaccccccGGGAAAagagagtgagagagtagagagagaccacacccccc"
  //     };
  //   } else {
  //     console.error("we shouldn't be here...");
  //     return {
  //       sequence: "taa"
  //     };
  //   }
  // },
  // getVersionList: () => {
  //   return [
  //     {
  //       dateChanged: "12/30/2211",
  //       editedBy: "Nara",
  //       // revisionType: "Sequence Deletion",
  //       versionId: 2
  //     },
  //     {
  //       dateChanged: "8/30/2211",
  //       editedBy: "Ralph",
  //       // revisionType: "Feature Edit",
  //       versionId: 3
  //     }
  //   ];
  // },
  showMenuBar: true,
  PropertiesProps: {
    propertiesList: [
      "general",
      "features",
      "parts",
      "primers",
      "translations",
      "cutsites",
      "orfs",
      "genbank",
    ],
  },
  ToolBarProps: {
    toolList: [
      "saveTool",
      "downloadTool",
      "importTool",
      "undoTool",
      "redoTool",
      "cutsiteTool",
      "featureTool",
      "alignmentTool",
      "versionHistoryTool",
      // "oligoTool",
      "orfTool",
      // "viewTool",
      "editTool",
      "findTool",
      "visibilityTool",
      // "propertiesTool"
      {
        name: "oligoTool",
        onIconClick: openPrimerDesignPanel,
        toggled: false,
        tooltip: primerDesignPanelName,
        tooltipToggled: primerDesignPanelName,
      },
    ],
  },
}); /* createDomNodeForMe will make a dom node for you and append it to the document.body*/

const isCircular = seqDataToUse && seqDataToUse.circular;
editor.updateEditor({
  sequenceData: seqDataToUse,
  sequenceDataHistory: {}, //clear the sequenceDataHistory if there is any left over from a previous sequence
  showCicularViewInternalLabels: true,
  annotationVisibility: {
    // features: false,
    orfTranslations: false,
  },
  readOnly: false,
  panelsShown: buildPanelsShown(isCircular ? "circular" : "rail"),
  annotationsToSupport: {
    features: true,
    translations: true,
    parts: true,
    orfs: true,
    cutsites: true,
    primers: true,
  },
});

window.api.on("ove_openPrimerDesign", openPrimerDesignPanel);
