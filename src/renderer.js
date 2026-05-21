// This window.initialSeqJson is getting set in preload from the query string from the main process load() call
const seqDataToUse = window.initialSeqJson || { circular: true };
// export default generateSequenceData()
const originalTitle = document.title;

let axisFontScalePercent = 100;

const circularViewStyleId = "ove-circular-view-dynamic-style";
const axisScalePercents = [33, 50, 75, 100, 125, 150, 200];
const axisScaleStorageKey = "oveAxisFontScalePercent";

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
    menuFilter: (menuDef) => insertAxisScaleIntoLabelsMenu(menuDef),
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
  menuFilter: (menuDef) => insertAxisScaleIntoLabelsMenu(menuDef),
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
  panelsShown: [
    [
      {
        // fullScreen: true,
        active: !!isCircular,
        id: "circular",
        name: "Circular Map",
      },
      {
        id: "rail",
        name: "Linear Map",
        active: !isCircular,
      },
    ],
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
  ],
  annotationsToSupport: {
    features: true,
    translations: true,
    parts: true,
    orfs: true,
    cutsites: true,
    primers: true,
  },
});
