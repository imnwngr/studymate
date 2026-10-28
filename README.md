# studymate v0.8.0

Chrome Manifest V3 extension for reviewing and filling supported learning exercises, with NGL / Spark, a conservative Generic adapter, optional AI fallback, and a read-only Inspector.

[Tiếng Việt](README.vi.md) · [Repository](https://github.com/imnwngr/spark-study-assistant) · [Changelog](CHANGELOG.md)

## Features

| Area | Current behavior and limits |
| --- | --- |
| NGL / Spark | Finds exercises in accessible frames; QTI-backed text, dropdown, radio, multiple-choice, sequence and text-correction workflows. Support depends on the exercise DOM. |
| Word Pool | Returns all placed tiles through the site's UI, verifies empty gaps, then refills from verified QTI. Already-filled editable exercises also reset and refill. Stops on an unverified return or placement; partial changes may remain. |
| Checkbox | Maps QTI choice IDs and verifies the selected set. Popup option validation can still block some multi-answer results before Apply. |
| Linking Lines | Maps unique endpoint labels to QTI pairs and sends connection gestures. Exact final connections are not observable, so results remain uncertain and need manual review. |
| Generic | Native text, select, radio and checkbox discovery in explicit exercise groups. Apply requires unique response identities and compatible embedded QTI. Custom widgets and ambiguous mappings are refused. No submission or automatic navigation. |
| QTI | Bounded XML or JSON-wrapped XML parsing without executing scripts. Page-provided answers do not independently prove publisher authenticity or saved grades. |
| Optional fallback | NGL can use configured OpenAI-compatible providers or limited offline rules. Generic AI/manual suggestions do not authorize Apply without its required local mapping. |
| Inspector | Read-only snapshots, bounded interaction recording, frame coverage, NGL deep evidence, Generic structural capture and local JSON export. Does not solve, submit or establish correctness. |
| Appearance | Ventrix, Chainsaw Editorial, Cognify and InsightOS. Light, dark and system themes; English, Vietnamese, Simplified Chinese and Traditional Chinese. |

Generic is not universal website compatibility. Synthetic tests do not prove authenticated website success, acceptance of simulated gestures, or grade persistence.

## Install and use

1. Download or clone this repository. The extension runtime needs no build or dependency installation.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the directory containing `manifest.json`.
3. After updating that folder, reload the extension and refresh exercise tabs.
4. Open studymate, choose **Scan**, review the detected exercise, then choose **Solve**. Eligible answers are applied; check the actual page and uncertain/skipped results.
5. Let Word Pool finish its complete Reset → Fill sequence before interacting again.
6. Use **Done & next** only when enabled and when you intend to submit. NGL may advance within an activity after verification gates pass. Submission remains explicit and does not guarantee a saved grade.

Settings contains language, provider, navigation and appearance preferences. Visual-style selection saves automatically. AI is optional and may incur provider charges. Version 0.8.0 identifies this source revision; no Web Store listing or GitHub Release is implied.

## Permissions and privacy

- **activeTab**, **scripting**, **webNavigation** and **storage** support user-invoked access, script injection, frame discovery and local settings.
- Declared host permissions cover NGL, Avallain frames and the OpenAI API origin. Optional HTTPS/localhost grants support authorized endpoints and frames; declaration alone does not grant access. Cross-origin frames may need separate grants.
- Restricted browser pages and closed Shadow DOM remain inaccessible. Multiple exercise frames can still be ambiguous; review the selected exercise.
- Keys/settings use Chrome local storage, not a hardened secret vault. Configured API calls send question/choice data to the chosen provider. Offline mode avoids provider calls.
- Inspector does not intentionally read cookies, authentication stores or application models. Editable values are redacted, but NGL text, selected answers, DOM IDs, titles and URL paths may remain. Some Solve failure diagnostics contain answer text. Review exports/logs before sharing.

## Inspector and local analysis

Open Inspector from the intended source tab, check frame coverage, capture a snapshot or start recording, interact, stop, then export JSON. Top-level navigation stops the session. Recordings are bounded and stop after three minutes; check coverage and truncation warnings.

Choose `inspector-data/exports` in the directory picker when supported. Permission may need renewal. Otherwise use Save As or browser download settings and copy the JSON into that directory. The extension cannot write to its source directory without user permission. Legacy Spark filenames and Inspector schema versions remain for compatibility.

Optional analysis uses Node.js built-ins:

```powershell
Set-Location 'C:\projects\spark-study-assistant'
node .\tools\analyze-inspector.cjs
```

Generated reports/prompts are proposals for separately authorized development, not automatic adapter changes. Keep recordings, generated analysis, profiles, screenshots, logs and credentials out of Git and shared archives. Git ignore rules do not define a safe ZIP package.

## Development and limitations

Runtime modules live in `core/`, `adapters/`, `solvers/` and `answer-sources/`. Node tests need no npm packages:

```powershell
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-wordpool.cjs
```

Browser fixtures need installed Chrome/Chromium; supported runners accept `SPARK_BROWSER`. Optional Python runners need Python and Playwright. Private-evidence tests may skip without local fixtures; some development checks reference ignored audit files. Preserve unrelated changes.

This update changes version metadata and documentation only. Word Pool return behavior, frame selection and Checkbox/Linking Lines limitations still require authenticated retesting. No tag or GitHub Release is created.

NGL / Spark names the external platform. The repository retains `spark-study-assistant` and compatibility identifiers. No standalone license file is included; this update grants no new redistribution rights.
