# studymate multi-site architecture

The active tab's registration identifies a known website. It does not prove that the current exercise is solvable. Frame-local adapters discover controls and answer sources; shared solvers execute interaction workflows through adapter-provided ports.

## Module map

```text
content.js                       Single guarded frame message bridge
core/
  site-registry.js               Official registrations, bounded host rules, restricted-page checks
  runtime.js                     Adapter selection, session dispatch, capability/verification diagnostics
  frame-access.js                Popup frame transport and ordered on-demand injection
adapters/
  ngl.js                         Existing NGL discovery, QTI access, DOM identities, gestures, submit/next gates
  generic.js                     Conservative native controls and explicit response identities
solvers/
  interactions.js                Text, dropdown, choice, multi, checkbox, Word Pool and Linking Lines workflows
  sequence.js                    Bounded ordering algorithm through sequence ports
  text-correction.js             Position-aware correction algorithm through editor ports
answer-sources/
  embedded-qti.js                Bounded inert XML/JSON discovery for the generic adapter
qti.js                           Existing reusable QTI parser; unchanged
solver.js                        Existing reusable offline answer engine; unchanged
background.js / providers.js     Existing provider/offline routing and credentials boundary; unchanged
popup.js                         Existing Scan / Solve / Apply coordination plus site/access status
site-status.css                  Small status line using existing theme tokens
```

No bundler, dependency installation, external service or version change is required. These are classic isolated-world scripts loaded in manifest order. The same ordered list is used by `SparkFrameAccess` for user-invoked injection. Repeated injection is guarded; each frame has one message listener and its own adapter session.

## Adapter contract

An adapter registers with `SparkCore.register(adapter)` and provides:

```javascript
{
  id: 'adapter-id',
  answerSource: 'source-type',
  detect({document, url}) { /* Read-only structural detection. */ },
  create({document, url}) {
    return {
      capabilities: ['native-text'],
      async dispatch(message) { /* Return {ok, result} or {ok:false, error}. */ }
    };
  }
}
```

Supported messages remain `SPARK_SCAN`, `SPARK_QTI`, `SPARK_APPLY`, `SPARK_COPY_PROMPT`, `SPARK_SUBMIT_NEXT` and `SPARK_FORWARD_SCREEN`. The bridge also handles `SPARK_PING` and read-only `SPARK_DIAGNOSTICS`. Existing response envelopes are preserved. Scan results gain an additive `architecture` object with registration, adapter, answer-source family, supported adapter capabilities and detected question-to-solver capabilities. Answer availability is established by the subsequent answer-source response, not by registration.

`SPARK_QTI` retains its historical name for caller compatibility; an adapter may return no QTI answers. A future adapter can resolve another documented answer source without changing shared interaction solvers. The existing popup still retains its configured offline/API fallback. The generic adapter requires its own verified embedded mapping before accepting Apply; generated suggestions alone cannot authorize DOM writes.

## Shared interaction ports

| Interaction | Adapter operations | Shared responsibility |
| --- | --- | --- |
| Text / Wordbuilding | `write`, `matches` | Write and verify accepted text |
| Dropdown | `hasOption`, `select`, `matches` | Require a unique option and verify selection |
| Choice / multi | `ids`, `single`, `checked`, `activate` | Apply exact desired selection and verify all states |
| Checkbox | `ids`, `read`, `activate`, `wait`, optional `accept` | Correct checked states with isolated transition verification |
| Word Pool | `prepare`, `read`, `returnToPool`, `resetComplete`, `empty`, `plan`, `place`, `finish`, `verify`, optional `blocked` | Return every occupant sequentially, verify an entirely empty interaction, fill all planned pairs, verify final mapping |
| Linking Lines | `current`, `resolve`, `connect`, `wait`, optional `verify` | Connect each mapped source directly to its target; never add a removal phase |
| Sequence | `tiles`, `uniqueList`, `fixed`, `pending`, `identity`, `drag`, `tileText`, normalization and wait helpers | Bounded reordering, settling, repeated-token safety and final order verification |
| Text correction | `available`, `tokens`, `modified`, `editorOpen`, `open`, `popup`, `confirm`, `choose`, visibility and normalization helpers | Position-aware changes and complete intermediate/final token audits |

Ports may use application DOM handles internally. Shared solvers contain no NGL selectors or hostnames. Site-specific source/target identity validation, live rebinding, UI event dispatch and model-driven state observation stay in the adapter. Word Pool return and placement use the existing supported UI gestures; no nodes are moved directly. Even already-correct editable pools follow Reset → Fill on another Solve.

The existing NGL Linking Lines result remains uncertain when final pair identities cannot be observed. Sending a gesture is not proof of application persistence or a saved score. Such outcomes cannot unlock progression.

## Registry and selection

Only **NGL / Spark** is officially registered: the exact `learn.eltngl.com` hostname. Its existing Avallain frame-origin family is matched using exact host or a dot-bounded subdomain suffix. `learn.eltngl.com.evil.example` and `evilavallain.net` do not match.

The core first checks a registered adapter's structural detection, then compatible player adapters, then generic discovery. An NGL player embedded on an unregistered host may use the NGL adapter when its structure and subsequent answer/control mapping establish compatibility. This does not register the outer website. A known hostname with no discovered exercises remains an empty scan.

To add an officially supported site:

1. Add its adapter and structural detection with deterministic identity/mapping rules.
2. Register it with the core and include it in the manifest and on-demand injection list.
3. Add exact/bounded hostname rules, name, capabilities and any frame-origin rules in `core/site-registry.js`.
4. Add native/DOM and browser fixtures for discovery, mappings, rejected ambiguity, stale state and verification.
5. Request only necessary persistent permissions through a separately reviewed permission change. Registration itself grants no access.

Adding a site that supplies existing interaction ports requires no shared solver changes. Adding a new interaction requires a shared solver, an adapter port and tests; unsupported kinds remain manual.

## Generic compatibility

Generic discovery currently inspects visible `fieldset` and `[data-response-identifier]` groups for native text inputs, textareas, selects, radio groups and checkboxes. An unmarked fieldset may be discovered for review, but cannot receive automated writes without an explicit response identity. Readonly/disabled fields, mixed/custom semantics, duplicate identities, stale nodes and changed control inventories are rejected.

Local verified answers require exactly one embedded QTI assessment in:

- `script[type="application/qti+xml"]`
- `script[type="application/xml"]`
- `script[type="application/json"][data-qti]` containing XML-valued `.xml` properties

The adapter maps QTI response identifiers to DOM response identifiers before invoking the existing structural parser. Choices additionally require consistent IDs and labels. Answer data is never evaluated. DTD/entities, malformed XML, oversized sources, ambiguous assessments and mismatched identities fail safely. Generic discovery does not fetch arbitrary page scripts or scrape hidden answer fields.

Generic Word Pool, drag/drop, correction editors, custom ARIA widgets, generic submission and generic navigation are not yet inferred from visual resemblance. A future adapter can supply verified ports for those existing shared solvers.

## Permissions and frames

Manifest permissions and host grants are unchanged. Existing NGL/Avallain static injection is preserved. `activeTab` and `scripting` allow user-invoked scanning on unregistered HTTP(S) pages without unrestricted persistent host access. The transport attempts each discovered frame separately; accessible frames can succeed while denied frames produce an explicit warning.

Unknown cross-origin child frames require additional host authorization. The extension does not silently request or grant it. `chrome://`, extension pages, Chrome Web Store pages and other restricted schemes are reported as access unavailable. Injection defects are distinguished from denied permissions. Missing exercise recognition is not a permission error.

Official references: [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

## Inspector and diagnostics

Inspector recording, exports, schema, analyzer and raw files are unchanged. Its established NGL recording workflow remains intact. Generic-site Inspector recording is not added by this refactor. Older generated prompts may still refer to `content.js`; that file now points to the migrated NGL implementation and shared solver modules.

Popup console stages include adapter/capability selection and existing Solve/Apply diagnostics. In an authorized extension console, inspect a selected frame with:

```javascript
chrome.tabs.sendMessage(TAB_ID, {type:'SPARK_DIAGNOSTICS'}, {frameId:FRAME_ID}).then(console.log)
```

The result contains bounded registration, adapter, solver, source-family, verification and failure status. It does not include credentials, full DOM, source URLs, or answer payloads. This is additive read-only telemetry and does not alter Inspector export consumers.

## Verification and manual testing

From Windows PowerShell:

```powershell
Set-Location 'C:\projects\studymate'
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-wordpool.cjs
node tests/run-browser-linking.cjs
node tests/run-browser-new-exercises.cjs
node tests/run-browser-multisite.cjs
node tests/run-browser-multisite-popup.cjs
node --check content.js
git diff --check
```

The last popup browser test runs the real popup and nested content scripts using mocked Chrome extension transport. It is not an installed-extension or authenticated-site test. The Python Playwright entrypoints have been updated to inline migrated modules; they require separately installed Python/Playwright and were not run in this environment. Their correction scenarios are also exercised by the dependency-free Node Chrome harness.

For authenticated NGL testing, reload the unpacked extension at `chrome://extensions`, then reload the Spark tab. Test Word Pool empty, incorrect, swapped and repeated-Solve states; all returns must finish before the first fill. Test Linking Lines wrong/occupied connections, checkbox correction, native choice/dropdown/text, sequences and correction editors. Confirm uncertain outcomes keep submission/navigation blocked. Test Inspector capture/export as before.

For generic manual testing, serve the repository using a local static server you already trust and open `tests/browser-multisite-frame.html`, or use a page with the explicit compatible contract above. Open the extension from its toolbar action, Scan, and Solve. It should say unregistered, read the nested answer key and fill `nested answer`; Done & next stays disabled. Open an unrelated page with no exercise and a restricted `chrome://` page to check distinct empty/access states. On a page with an inaccessible cross-origin frame, confirm its access warning and no attempted unsafe fallback.

No authenticated success, score persistence, cross-origin permission grant or release is established by synthetic tests. Wait for explicit user `TEST OK` and a separate release decision.
