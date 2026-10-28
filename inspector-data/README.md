# studymate Inspector Intelligence (local only)

This directory is **inside the existing extension repository**. It stores Inspector recordings and offline analysis. Raw JSON files are **never modified** by the analyzer. `exports/`, `reports/`, and `prompts/` are ignored by Git; the `.gitkeep` files preserve their directory structure. Reports/prompts may contain exercise details; review before sharing.

## First use in Windows PowerShell

```powershell
Set-Location 'C:\projects\studymate'
node .\tools\analyze-inspector.cjs
```

Running this command **creates all three directories if missing** and analyzes all `.json` files in `inspector-data/exports`. It requires Node.js, using only built-in Node modules (no `npm install`).

## Export into the repository

1. Load or reload the unpacked extension from this repository in Chrome, then open **Exercise Inspector** from studymate.
2. Choose **Choose exports folder**, navigate to `C:\projects\studymate\inspector-data\exports`, and authorize **read/write** access. Inspector checks the folder name is `exports`; Chrome does not expose its full path to the page, so **verify the path yourself in the picker**.
3. Choose **Capture screen** and/or **Start recording** → interact in Spark → **Stop recording**. Choose **Export JSON**. The extension writes a unique JSON file to the selected directory and retains the handle using IndexedDB when available. Chrome may ask for write access again after closing/reopening Inspector.
4. Run the analysis command above. Read `inspector-data/reports/index.json`, the per-hash `analysis-*.json` reports, and `inspector-data/prompts/prompt-*.md`.

Chrome's File System Access API requires user selection and permissions. Some Chrome versions/policies disallow access to sensitive folders, including source folders; the extension cannot write to its installed directory by itself. If selection is rejected, use **Export JSON** with the browser's **Save As** dialog. Explicitly select `inspector-data/exports`. If the File System Access API is unavailable, the Export JSON click triggers the browser's normal download flow with a visible notice; the browser may put the file in Downloads. Import it using:

```powershell
Set-Location 'C:\projects\studymate'
node .\tools\analyze-inspector.cjs --import 'C:\path\spark-inspector-example.json'
```

Replace the example with the actual downloaded filename. The command copies bytes into `exports/` under a collision-safe name, preserving the source. You can also move/copy exports into `inspector-data/exports` yourself. **No server or external service is used.** Save As and directory write failures are reported in Inspector; the extension never silently switches to a different folder when an authorized directory becomes inaccessible.

## Repeated analysis

```powershell
Set-Location 'C:\projects\studymate'
node .\tools\analyze-inspector.cjs
Get-Content .\inspector-data\reports\index.json
Get-ChildItem .\inspector-data\prompts\*.md
node --test --test-isolation=none .\tests\inspector-intelligence.test.cjs .\tests\inspector-export.test.cjs
```

Each valid raw export is hashed with SHA-256. Identical bytes generate **one** report and **one** prompt, with all original source filenames recorded. Running the command again yields the same per-hash output names. Malformed input produces `reports/invalid-*.json` and an error exit code; other exports are still processed. Reports and prompts are regenerated on demand. New exports are not processed automatically until the command runs.

The analyzer recognizes observed `om-text-gap`, `ic-text-correction`, `os-sequence`, radio, checkbox, dropdown, text gap, and wordbuilding classes, and records unknown classes without guessing a Solve adapter. It extracts frame ancestry, known interactive IDs, selectors, event ordering, compact initial/final state projections, target IDs, possible word-pool/gap metadata, QTI script references, and **explicit response mappings only if present**. Inspector's current capture format usually contains QTI references rather than explicit answer declarations; missing QTI mapping is reported as missing evidence. Truncation, missing frames, ambiguous mappings, and unverified outcomes lead to proposed data collection, not a speculative patch.

Prompts are **English analysis proposals**. They must be reviewed and separately authorized before any implementation. During concurrent Solve work, never run generated prompts automatically, and preserve `content.js`, `qti.js`, and Solve tests. Do not commit, push, tag, or release as part of this Inspector workflow.
