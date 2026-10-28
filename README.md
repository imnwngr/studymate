<p align="center"><img src="docs/images/hero.svg" alt="studymate product illustration: a dark violet extension panel with a separate read-only Inspector" width="100%"></p>
<h1 align="center">studymate</h1>
<p align="center"><strong>Review the exercise. Apply with evidence.</strong></p>
<p align="center">
  <img src="https://img.shields.io/badge/version-0.8.0-555555?style=flat-square" alt="Version 0.8.0">
  <img src="https://img.shields.io/badge/browser-Chrome-555555?style=flat-square" alt="Chrome">
  <img src="https://img.shields.io/badge/extension-Manifest_V3-555555?style=flat-square" alt="Manifest V3">
</p>
<p align="center"><strong>English</strong> · <a href="README.vi.md">Tiếng Việt</a></p>
<p align="center"><a href="#interface">Interface</a> · <a href="#workflow">Workflow</a> · <a href="#styles">Styles</a> · <a href="#inspector">Inspector</a> · <a href="#quick-start">Install</a> · <a href="#privacy">Privacy</a> · <a href="#development">Development</a></p>

---

A Chrome extension for supported **NGL / Spark** and compatible **QTI** exercises. Scan the page, review the available mapping, and apply eligible results through the website's controls. A separate Inspector helps collect evidence when an interaction needs investigation.

> [!IMPORTANT]
> Support depends on exercise structure and permissions. Checkbox and Linking Lines have limitations below. Local screenshots and synthetic tests do not establish authenticated website success or saved grades.

<a id="interface"></a>
## The interface

<table>
<tr><th width="34%">Main popup</th><th width="66%">Settings</th></tr>
<tr><td valign="top"><a href="docs/images/popup.webp"><picture><source media="(prefers-color-scheme: light)" srcset="docs/images/popup-light.webp"><img src="docs/images/popup.webp" alt="Actual popup UI in a safe local fixture, showing an empty exercise and scan in progress" width="100%"></picture></a></td><td valign="top"><a href="docs/images/settings.webp"><img src="docs/images/settings.webp" alt="Actual Settings UI: appearance controls and four distinct visual style selectors in a local fixture" width="100%"></a><p>Language, appearance, provider configuration and navigation preferences in one place.</p></td></tr>
</table>

*Screenshots show the actual repository UI rendered by Chrome with mocked extension APIs and no learner data. Popup previews show an empty/scanning state. They are not authenticated-site or installed-extension screenshots. Click to enlarge.*

<a id="workflow"></a>
## From scan to verified state

<picture><source media="(max-width: 640px)" srcset="docs/images/workflow-mobile.svg"><img src="docs/images/workflow.svg" alt="Scan, detect exercise, resolve mapping, apply, verify; Inspector independently observes and exports JSON without applying answers" width="100%"></picture>

Unverified or unsupported transitions stop for review. Word Pool uses **Reset → Verify every gap empty → Fill → Verify mapping**, including already-filled editable exercises. Partial changes can remain after a failed transition. Verification means observed UI state, not guaranteed grading.

<a id="features"></a>
## What it supports

| Capability | NGL / Spark | Generic adapter |
| --- | --- | --- |
| Discovery | Accessible frames and supported platform widgets | Native controls in explicit exercise groups |
| Answer source | Supported QTI; optional configured fallback | Compatible embedded QTI with unique response IDs |
| Apply | Text, dropdown, radio, multiple-choice, sequence, text correction | Native text, select, radio, checkbox; refuses ambiguous mappings |
| Word Pool | Reset and refill through supported site controls | Custom word-pool protocol unsupported |
| Checkbox | QTI IDs and final selected-set checks; popup can block some multi-answer results | Native checked-state application with compatible mapping |
| Linking Lines | Endpoint mapping and gestures; exact final graph unverified | Custom linking widgets unsupported |
| Submission | Explicit submission and gated NGL within-activity progression | No submission or automatic navigation |

QTI XML / JSON-wrapped XML is parsed with bounds, without executing scripts. Page-provided declarations do not independently prove publisher authenticity. NGL can use optional OpenAI-compatible providers or limited offline rules; Generic suggestions cannot authorize Apply without its required local mapping.

<a id="styles"></a>
## Four styles, four compositions

<table>
<tr><th width="50%">Ventrix</th><th width="50%">Chainsaw Editorial</th></tr>
<tr><td align="center"><a href="docs/images/popup.webp"><img src="docs/images/popup.webp" alt="Ventrix: centered headline, rounded command button and violet atmosphere; actual local UI screenshot" width="320"></a></td><td align="center"><a href="docs/images/style-editorial.webp"><img src="docs/images/style-editorial.webp" alt="Chainsaw Editorial: serif headline, asymmetric red rule and squared action; actual local UI screenshot" width="320"></a></td></tr>
<tr><th>Cognify</th><th>InsightOS</th></tr>
<tr><td align="center"><a href="docs/images/style-cognify.webp"><img src="docs/images/style-cognify.webp" alt="Cognify: compact cyan instrumentation, framed heading and segmented steps; actual local UI screenshot" width="320"></a></td><td align="center"><a href="docs/images/style-insightos.webp"><img src="docs/images/style-insightos.webp" alt="InsightOS: rounded dark modules, lime command button and grouped progress; actual local UI screenshot" width="320"></a></td></tr>
</table>

Select a style in **Settings**; it saves automatically. Light, dark and system themes are available. Interface languages: English, Vietnamese, Simplified Chinese and Traditional Chinese. Appearance does not change solver capabilities.

<a id="inspector"></a>
## Observe with Inspector

<details>
<summary><strong>Open the Inspector interface preview</strong></summary>

<a href="docs/images/inspector.webp"><img src="docs/images/inspector.webp" alt="Actual Inspector UI in a local fixture: capture, JSON export, recording controls and zero captured events; example.invalid is a dummy source" width="100%"></a>

*Local UI screenshot, not a live recording. The source is the reserved dummy domain example.invalid. No answers, credentials or session identifiers are shown.*

</details>

1. Open Inspector from the intended source tab and check frame coverage.
2. Capture a snapshot or record a manual interaction; stop and review coverage/truncation warnings.
3. Export JSON. Choose `inspector-data/exports` when the directory picker is available; otherwise use Save As/download settings and copy it there.

Inspector is read-only: it does not solve, submit or establish correctness. Recording is bounded, stops after three minutes, and ends on top-level navigation. Cross-origin frames and directory access may need permission again.

Optional local analysis: `node .\tools\analyze-inspector.cjs`. Generated reports/prompts are proposals for a separately authorized development step. [Workflow guide](inspector-data/README.md) · [Universal Inspector](docs/UNIVERSAL_INSPECTOR.md) · [Deep evidence](docs/inspector-deep.md)

---

<a id="quick-start"></a>
## Install and use

**Chrome + the source folder. No runtime build or dependency installation.** Download the source ZIP or clone:

```powershell
git clone https://github.com/imnwngr/studymate.git
Set-Location studymate
```

1. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`.
2. Open an exercise, launch studymate, choose **Scan**, review the detected frame, then **Solve**.
3. Inspect actual results. Let Word Pool finish resetting and filling before interacting again.
4. Use **Done & next** only when enabled and when you intend to submit. NGL can advance within an activity after verification gates pass; a changed button does not prove saved grades.

**Updating:** pull source, reload the extension, then refresh exercise tabs. If its directory was renamed, load the new location and review permissions/settings. Version 0.8.0 does not imply a Chrome Web Store listing or GitHub Release.

<a id="privacy"></a>
## Privacy, permissions and limits

| Access | Purpose |
| --- | --- |
| `activeTab`, `scripting`, `webNavigation` | User-invoked access, permitted script injection and frame discovery |
| `storage` | Local settings and provider configuration, not a hardened secret vault |
| Declared host access | NGL, Avallain frames and the OpenAI API origin |
| Optional HTTPS / localhost | Explicitly authorized endpoints or frames; declaration alone grants nothing |

API calls send question/choice data to the configured provider and may incur charges; offline mode avoids provider calls. Inspector does not intentionally read cookies, authentication stores or application models. Editable values are redacted, but NGL text, selected answers, DOM IDs, titles and URL paths can remain. Some Solve failure diagnostics can contain answer text. **Review exports/logs before sharing.**

<details>
<summary><strong>Known limitations and local-data boundaries</strong></summary>

- Checkbox popup validation can reject some multi-answer results before Apply.
- Linking Lines cannot verify exact final connections; review them manually.
- Multiple exercise frames can be ambiguous. Generic refuses unsupported/custom widgets, missing mappings and stale DOM.
- Restricted browser pages and closed Shadow DOM are inaccessible.
- Word Pool return behavior and application persistence need authenticated retesting for the specific exercise. Synthetic success is not live-site proof.
- Keep recordings, reports, prompts, browser profiles, credentials and private artifacts out of Git/archives. Ignore rules are not a safe ZIP policy.
- Legacy export schema names, storage keys and `SPARK_*` contracts remain for compatibility; NGL / Spark names the external platform.

</details>

<a id="development"></a>
## Development

<details>
<summary><strong>Project structure and test commands</strong></summary>

```text
studymate/
├── core/ · adapters/        Frame/runtime coordination and site adapters
├── answer-sources/         Embedded QTI integration
├── solvers/                Shared interaction solvers
├── popup.* · options.*     Workflow and Settings
├── inspector*.js           Read-only capture/export
├── tests/ · tools/         Local verification and analysis
└── docs/ · inspector-data/ Documentation and private local evidence
```

Node tests need no npm packages. Browser fixtures need installed Chrome/Chromium; supported runners accept `SPARK_BROWSER`. Optional Python runners need Python and Playwright.

```powershell
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-wordpool.cjs
node tests/run-browser-multisite.cjs
node tests/run-browser-inspector-universal.cjs
node tests/run-browser-linking.cjs
```

Private-evidence tests may skip without fixtures; some checks reference ignored audit files. See [architecture](docs/MULTISITE_ARCHITECTURE.md) and [visual asset provenance](docs/images/README.md). Preserve unrelated work; distinguish synthetic tests from authenticated checks.

</details>

---

[Repository](https://github.com/imnwngr/studymate) · [Changelog](CHANGELOG.md) · [Tiếng Việt](README.vi.md)

No standalone license file is included. This documentation grants no new redistribution rights.
