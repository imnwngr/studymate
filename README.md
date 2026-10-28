<h1 align="center">studymate</h1>
<p align="center"><strong>Review the exercise. Apply with evidence.</strong></p>
<p align="center">A Chrome extension for supported NGL / Spark and compatible QTI exercises.</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-0.8.0-555555?style=flat-square" alt="Version 0.8.0">
  <img src="https://img.shields.io/badge/browser-Chrome-555555?style=flat-square" alt="Browser: Chrome">
  <img src="https://img.shields.io/badge/extension-Manifest_V3-555555?style=flat-square" alt="Extension: Manifest V3">
</p>
<p align="center"><strong>English</strong> · <a href="README.vi.md">Tiếng Việt</a></p>
<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#features">Features</a> ·
  <a href="#inspector">Inspector</a> · <a href="#privacy">Privacy</a> ·
  <a href="#development">Development</a> · <a href="#limitations">Limitations</a>
</p>

---

studymate reads supported exercises, obtains available answer mappings, and applies eligible results through the website's controls. Review the detected exercise and the actual page state before submitting.

> [!IMPORTANT]
> Compatibility depends on the exercise structure and browser permissions. Synthetic tests do not prove authenticated website success or saved grades. Checkbox and Linking Lines have specific limitations described below. Version 0.8.0 is the source version, not a claim of a Chrome Web Store listing or GitHub Release.

<a id="quick-start"></a>
## Quick start

**You need Chrome and a copy of this repository.** Git is optional if you download the source ZIP. The extension runtime needs no build step, Node.js or dependency installation.

```powershell
git clone https://github.com/imnwngr/studymate.git
Set-Location studymate
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `studymate` folder containing `manifest.json`.
3. Open a supported exercise and wait for it to load.
4. Open studymate, choose **Scan**, and review the detected exercise/frame.
5. Choose **Solve**. Eligible answers are applied; inspect uncertain or skipped results on the actual page.

**Updating:** pull the latest source, reload the extension in Chrome, then refresh exercise tabs. If your unpacked extension used a folder that has since been renamed, remove that unpacked entry and load the new folder; review permissions and settings afterward.

**Submission:** use **Done & next** only when enabled and when you intend to submit. NGL can advance within an activity after its verification gates pass. Generic has no submission or automatic navigation. A changed button does not prove a saved grade.

---

<a id="features"></a>
## Supported workflows

| Capability | NGL / Spark | Generic adapter |
| --- | --- | --- |
| Discovery | Accessible exercise frames and supported platform widgets | Native controls in explicit exercise groups |
| Answer source | Supported QTI mappings; optional configured fallback | Compatible embedded QTI with unique response identities |
| Apply | Text, dropdown, radio, multiple-choice, sequence and text correction, subject to widget checks | Native text, select, radio and checkbox; refuses ambiguous or unsupported controls |
| Word Pool | Reset all occupied gaps, verify empty, then refill from QTI | No platform-specific word-pool protocol |
| Checkbox | QTI IDs and selected-set verification; popup can block some multi-answer results | Native checked-state application with a compatible mapping |
| Linking Lines | QTI endpoint mapping and connection gestures; final graph remains unverified | Custom linking widgets unsupported |
| Submission / navigation | Explicit submission and gated within-activity progression | Unsupported |

QTI XML or JSON-wrapped XML is parsed with bounds, without executing embedded scripts. Page-provided declarations are not independent proof of publisher authenticity or grading correctness.

Word Pool follows **Reset → Verify empty → Fill → Verify mapping**, including already-filled editable exercises. It stops on an unverified transition; successful partial changes may remain. Let the sequence finish before interacting again.

### Optional AI and offline fallback

NGL workflows can use configured OpenAI-compatible providers or limited offline rules. API calls send question/choice data to the selected provider and can incur charges. Offline mode avoids those provider calls. Generic AI/manual suggestions cannot authorize Apply without the required local mapping.

### Four visual styles

| Style | Presentation |
| --- | --- |
| Ventrix | Centered type and a violet horizon |
| Chainsaw Editorial | Serif headlines with black and red framing |
| Cognify | Precise controls with cyan accents |
| InsightOS | Dark modules with lime accents |

Choose a style in **Settings**; it saves automatically. Light, dark and system themes are available, with English, Vietnamese, Simplified Chinese and Traditional Chinese interface languages. Changing appearance does not change solving capabilities.

<a id="inspector"></a>
## Inspector

Inspector observes; it does not solve, submit, simulate actions or establish correctness.

1. Open Inspector from the intended source tab and check frame coverage.
2. Capture a snapshot or start recording, then perform the interaction manually.
3. Stop recording and check coverage, missing-boundary and truncation warnings.
4. Export JSON and review it before sharing.

Recordings are bounded and automatically stop after three minutes. Top-level navigation stops the session; child-frame document generations are tracked separately. NGL deep capture and Generic structural capture retain different evidence.

Choose `inspector-data/exports` when the directory picker is supported. Chrome may request permission again. Otherwise use Save As or browser download settings, then copy the export into that directory. The extension cannot write to its source folder without user permission.

Optional local analysis needs Node.js and built-in modules only:

```powershell
# Run from the repository root.
node .\tools\analyze-inspector.cjs
```

Reports and prompts are proposals for a separately authorized development step, not automatic adapter modifications. See [Inspector workflow](inspector-data/README.md), [Universal Inspector](docs/UNIVERSAL_INSPECTOR.md) and [deep evidence](docs/inspector-deep.md).

---

<a id="privacy"></a>
## Privacy and permissions

| Permission / data | Purpose and boundary |
| --- | --- |
| `activeTab`, `scripting` | User-invoked access and script injection into permitted frames |
| `webNavigation` | Discover the tab's frame hierarchy |
| `storage` | Store local preferences and provider configuration |
| Declared host access | NGL, Avallain frames and the OpenAI API origin |
| Optional HTTPS / localhost | Authorized provider endpoints and frame access; declaration does not grant access automatically |

Cross-origin frames can need separate grants. Restricted browser pages and closed Shadow DOM are inaccessible. Keys/settings use Chrome local storage, which is not a hardened secret vault.

Inspector does not intentionally read cookies, authentication stores or application models. Editable values are redacted, but NGL text, selected answers, DOM identifiers, titles and URL paths can remain. Some Solve failure diagnostics can contain answer text. **Review exports and logs before sharing; avoid sensitive pages.**

Recordings, reports, prompts, browser profiles, credentials and local artifacts stay outside Git through ignore rules. These rules do not define a safe ZIP package. Export schema markers, filenames, storage keys and `SPARK_*` message contracts retain compatibility names; NGL / Spark remains the external platform's name.

<a id="structure"></a>
## Project structure

```text
studymate/
├── manifest.json             Extension metadata and permissions
├── popup.* / options.*       Exercise workflow and Settings
├── core/                    Site registry, frames and runtime
├── adapters/                NGL and Generic discovery/application
├── answer-sources/          Embedded QTI integration
├── solvers/                 Shared interaction solvers
├── inspector*.js            Read-only capture and export
├── tools/                   Optional local analysis
├── tests/                   Node tests and synthetic browser fixtures
├── docs/                    Architecture and workflow notes
└── inspector-data/          Local private data; README/placeholders tracked
```

<a id="development"></a>
## Development and testing

Node tests need no npm packages. Chrome fixtures need an installed Chrome/Chromium browser; supported runners accept `SPARK_BROWSER`. Optional Python runners need Python and Playwright.

```powershell
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-wordpool.cjs
node tests/run-browser-multisite.cjs
node tests/run-browser-inspector-universal.cjs
node tests/run-browser-linking.cjs
```

Private-evidence tests may skip without local fixtures; some development checks still reference ignored audit files. Preserve unrelated changes and distinguish synthetic verification from authenticated testing. Read the [multisite architecture](docs/MULTISITE_ARCHITECTURE.md) before changing runtime contracts.

<a id="limitations"></a>
## Known limitations

- Checkbox popup validation can reject some multi-answer results before Apply.
- Linking Lines sends gestures but cannot verify exact final connection identities; review manually.
- Multiple exercise frames can be ambiguous; check the selected exercise.
- Generic requires a compatible embedded mapping; custom widgets and stale DOM can be refused.
- Word Pool return behavior and application persistence still need authenticated retesting for the specific exercise.
- Synthetic success does not establish live-site compatibility or saved grades.

---

[Repository](https://github.com/imnwngr/studymate) · [Changelog](CHANGELOG.md) · [Vietnamese guide](README.vi.md)

No standalone license file is included. Renaming does not grant new redistribution rights.
