# studymate

A Chrome Manifest V3 extension for reading, reviewing and filling supported learning exercises. studymate includes an NGL / Spark adapter, conservative native-control discovery for other websites, configurable AI fallback, four visual styles, and a read-only Inspector.

[Tiếng Việt](README.vi.md) · [Repository](https://github.com/imnwngr/spark-study-assistant) · [Changelog](CHANGELOG.md)

## Release status

The manifest remains **0.7.16**. **v0.8.0 is a proposed release, not a published or fully verified candidate.** The working tree contains development changes, including deferred integration that must be excluded before publication. No current test-pass badge or authenticated compatibility claim is made.

The project name is now **studymate**. The GitHub repository and existing local directory remain named `spark-study-assistant`. Compatibility-sensitive identifiers and stored preferences retain their existing names.

## Features and supported environments

| Area | Current implementation and limits |
| --- | --- |
| NGL / Spark | Exercise discovery across accessible frames; QTI mapping; text, dropdown, radio, multiple-choice, sequence and text-correction workflows. Support depends on the actual exercise structure. |
| Word Pool | Returns placed tiles through the site's UI, verifies empty gaps, then refills from the QTI mapping. Already-filled editable exercises follow the same Reset → Fill workflow. Original-box association, occupied-gap binding and live retention still require review. |
| Checkbox | Maps QTI IDs and checks the final selected set. A known popup validation condition can reject valid multiple-answer results before Apply. |
| Linking Lines | Maps unique endpoint labels to QTI pairs and sends connection gestures. The current adapter cannot observe the exact final graph and returns an uncertain result. This is not fully verified automatic solving. |
| Generic Multisite | Discovers native text fields, selects, radios and checkboxes in explicit exercise groups. Automatic application requires unique response identities and a compatible embedded QTI assessment. Unsupported controls and stale DOM references are refused. |
| Embedded QTI | Parses bounded XML or JSON-wrapped XML without evaluating scripts. A page-provided answer declaration is not independent proof of publisher authenticity or grading correctness. |
| AI and offline fallback | Existing NGL workflows can use configured OpenAI-compatible providers or limited offline rules. Generic suggestions without a locally verified mapping cannot authorize Apply. |
| Appearance | Ventrix, Chainsaw Editorial, Cognify and InsightOS; light, dark and system modes; English, Vietnamese, Simplified Chinese and Traditional Chinese. |
| Inspector | Read-only DOM snapshots and bounded interaction recording, frame coverage, NGL deep evidence, generic structural capture and local JSON export. |

Generic support does not mean universal website compatibility. Custom widgets, inaccessible frames, ambiguous exercises and missing answer sources can prevent operation. No deferred site-specific adapter is advertised as supported.

## Installation

1. Download or clone the current [repository](https://github.com/imnwngr/spark-study-assistant).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the directory containing `manifest.json`.
4. Open the intended learning website. After updating the extension, reload it and refresh the exercise tab.
5. Open **studymate** from the extension toolbar.

No build step is required for the current classic-script runtime. The repository's published revision may differ from this local development candidate. Do not assume that a v0.8.0 download exists.

## Use

1. Open the intended exercise and allow it to finish loading.
2. Open studymate and use **Scan** to review the detected exercise.
3. Choose **Solve**. The popup reads available answers and invokes Apply for eligible results.
4. Review the actual website state and any uncertain or skipped results.
5. Use **Done & next** only when enabled and when you intend to submit.

Solve can advance within an NGL activity after its verification gates pass. Gradebook submission remains a separate explicit action. A changed submission button does not independently prove that a score was saved. Generic adapters do not support submission or automatic navigation.

Configure providers, language, appearance and navigation preferences in **Settings**. API use is optional and can incur provider charges. Save provider settings to request permission for their endpoints. Visual-style selection saves automatically.

## Inspector

1. Open Inspector from studymate while the intended source tab is selected.
2. Check frame coverage and request access only to the frame origins you intend to inspect.
3. Capture a DOM snapshot, or start recording and perform the interaction manually.
4. Stop recording; inspect warnings about inaccessible frames, truncation and missing boundaries.
5. Export JSON and review it before sharing.

Inspector remains attached to the chosen tab. Top-level navigation stops the session; child-frame document generations are tracked separately. Recording automatically stops after three minutes. It does not solve, submit, simulate interactions or establish answer correctness.

Choose the repository's `inspector-data/exports` directory for local exports when the browser supports a directory picker. Access may need renewed permission. Otherwise use Save As; browsers without pickers use their download settings. The extension cannot infer the repository's absolute path or silently grant filesystem access.

Inspector export filenames, schema markers and persisted directory identifiers retain legacy Spark names for compatibility.

Optional local analyzers under `tools/` are developer utilities, not required extension runtime assets. Generated reports and prompts are proposals for a separate authorized development step.

## Permissions

- **activeTab**: temporary access associated with the user's extension action.
- **scripting**: inject required scripts into accessible frames.
- **webNavigation**: discover the tab's frame hierarchy.
- **storage**: save local preferences and provider configuration.
- Existing host permissions cover NGL, Avallain frames and the declared OpenAI API origin.
- Optional HTTPS and localhost permissions support explicitly authorized endpoints or frame access. Declaring an optional permission does not grant it automatically.

Cross-origin frames may need separate grants. Restricted browser pages, denied frames and closed Shadow DOM remain unavailable.

## Privacy and local data

Provider keys and settings use Chrome local storage; they are not a hardened secret vault. Configured API calls send exercise questions and choices to the chosen provider. Offline mode avoids those provider calls.

Inspector does not intentionally read cookies, authentication stores or application models. Editable values are redacted, but exports are **not guaranteed anonymized**: NGL exercise text, selected answers, DOM identifiers, titles and URL paths can remain. Generic capture records structural controls and selection state. Avoid recording sensitive pages and review every export before sharing.

Known Solve failure diagnostics can include answer text. This is an outstanding privacy finding, not a guarantee of sanitized logs.

Keep recordings, generated reports, prompts, browser profiles, screenshots, logs, credentials and local audit files out of commits and release packages. `.gitignore` is not a ZIP packaging policy; use a reviewed production allowlist.

## Known limitations

- Linking Lines lacks exact final-graph verification.
- Checkbox multi-answer validation needs correction before reliable end-to-end use.
- Multiple exercise frames can be selected ambiguously by the current popup.
- Generic Apply requires its own embedded mapping; AI/manual suggestions are not sufficient.
- Generic DOM replacement normally causes safe refusal and a fresh scan.
- Word Pool return-to-original-box identity and target-order assumptions need live verification.
- Synthetic test results do not establish authenticated website compatibility or grade persistence.
- The local tree still contains deferred site-specific integration; an unrestricted directory ZIP is not a release candidate.

## Development and contribution

Runtime code lives in `core/`, `adapters/`, `solvers/` and `answer-sources/`. The popup coordinates Scan → Solve → Apply. Inspector scripts run independently of Solve during on-demand recording.

Review the current source and ownership constraints before editing. Preserve unrelated local changes. Use minimal patches and document observed behavior separately from hypotheses. Tests and fixtures can be used locally but are excluded from the currently proposed release commits and runtime package.

After authorization, run focused Node tests and browser fixtures for changed behavior, then test the exact selected candidate. Browser runners and analyzers may create local artifacts. Authenticated user testing and explicit **TEST OK** remain required before release approval.

## Attribution and licensing

The repository remains maintained at [imnwngr/spark-study-assistant](https://github.com/imnwngr/spark-study-assistant). NGL / Spark identifies the external learning platform, not this extension's new name.

No standalone license file was found in the reviewed repository. This rebrand does not add a license or grant new redistribution rights. Preserve existing notices and clarify licensing with the repository owner before redistribution.
