# Deep Inspector: collection and evidence contract

Inspector observes the DOM. It does not solve, apply, submit, intercept handlers, read application stores, fetch QTI, or inspect popup execution internals. Exercise state is never written. New captures omit raw HTML, inline script text and unrelated page controls. Review exercise text and any recorded input values before sharing.

## Exact live Chrome procedure

1. Coordinate with the concurrent Solve session before reloading the unpacked extension. In chrome://extensions, reload the existing studymate extension, then refresh the authenticated Spark exercise tab so the new Inspector content script is installed. An already-installed listener intentionally ignores reinjection; reopening Inspector alone does not upgrade that tab.
2. Open **1d | Real life | 1**. Open Inspector through the extension. Check Frame diagnostics: an accessible exercise frame must show interactionCount greater than zero. Dashboard/nullblank alone is insufficient.
3. Select **Initial capture**, then **Capture screen**. Select **Manual reference interaction**, click **Start recording**, and wait for an attached exercise iframe. Perform one ordinary source selection and destination placement yourself. Wait at least two seconds after the last action; click **Stop recording**. This establishes observed behavior, not answer correctness.
4. Restore the exercise to its initial state using Spark's normal controls yourself, if available; Inspector cannot restore it. Capture that initial state again. If restoration requires submission or another consequential operation, use a fresh authorized exercise session instead.
5. Select **Automated Solve/Apply attempt**, click **Start recording**, and wait for attachment. Return to the extension popup and invoke the existing Solve/Apply workflow yourself. Keep Inspector open. Wait for the attempt to finish and another two seconds, then **Stop recording**. A popup action can produce zero exercise DOM events; that is useful evidence, not proof of the execution stage.
6. Select **Final capture**, click **Capture screen**, then **Export JSON**. Choose this project's inspector-data/exports folder or save there using Save As. Preserve the exported file unchanged.
7. Repeat steps 2–6 for **1e | Writing skill | 2**. Separate recordings are required even if both exercises are exported together.
8. From the repository run: node tools/analyze-inspector.cjs. Read inspector-data/reports/index.json and the separate analysis JSON and English Markdown prompt for each exercise/frame/session. Every JSON Pointer refers to the original export, identified by its SHA-256.

## Popup diagnostic correlation

No popup instrumentation or Solve-owned changes are included. If the existing Solve workflow offers execution diagnostics, collect only a reviewed, minimal diagnostic summary separately. Keep it as a sidecar, not as edits to the Inspector export. Record the export SHA-256, recording sessionId, phase, exercise title, interactive ID, frameId, frame instanceId, UTC attempt start/end, and the exact diagnostic source. Correlate those fields manually with event at/ms timestamps and the report's original JSON Pointers. Record mapping produced, apply invoked and any reported result only when explicitly present in that diagnostic source; otherwise mark them unknown. Do not paste console dumps, request headers, tokens, storage, authenticated responses or arbitrary application objects. The analyzer does not import or authenticate sidecar claims. This is an explicit correlation workflow, not access to extension internals.

## Additive JSON schema

The existing export version remains unchanged. deepSchema: 1 identifies additive fields. Legacy captures and recordings remain readable; missing deep evidence is reported rather than invented.

- Capture frame: frame (instanceId, accessible ancestry, complete), deepInteractions and responseDeclarations.
- Interaction: root, identity with titleSource and interactiveId, sources, destinations, handles, feedback and bounds.
- Node: tag, id, modelId, classes, bounded text, allowlisted attributes, frame-scoped structural locator with observed uniqueness, lifetime nodeId, connected, visible, enabled/disabled, selected, and occupancy observations. hasText or filledClass is a UI observation, not grading evidence. Structural selectors may become stale after rerender.
- Timeline: at UTC, ms, instanceId and actionId. action-before has the state observed by a capture-phase listener (earlier capture listeners may already have run) and trigger. action-after samples at 0, 180, 750 and 1800 ms with target/root connectivity. Mutation samples retain allowlisted old attributes and added/removed node summaries. isTrusted is event metadata, never proof of actor identity. Correlation does not prove causality; overlapping actions are explicitly ambiguous.
- Recording: sessionId, operator-selected phase and phaseEvidence. Initial/final captures have independently selected phases. These labels do not claim event provenance.
- Reports: spark-inspector-intelligence/v2, isolation, evidenceReferences, diagnostic actions/transitions, completeness issues, collectionInstructions, stage hypotheses and mappingStatus. Each distinct recording frame generation receives a separate report; observed title/interactive-ID transitions within one frame are split into segments with original event pointers and missing boundary states reported; matching legacy snapshots may supply context only when identity fields do not conflict. Inventory contributes ancestry metadata rather than mappings or exercise identity. Unscoped top-level mappings are excluded from grouped reports; direct legacy analyze() remains available.

Only inline XML responseDeclaration/correctResponse values are parsed. data.js URLs are references. Imported declaration claims remain untrusted; visible source/target binding is unverified. No answer is reconstructed from visible labels. Conflicting response IDs/values are flagged.

## Bounds and limitations

Defaults/ceilings: 8 roots, 60 sources and destinations per root, 6 children per node, 8 feedback nodes per root, 360 timeline records, 650000 serialized characters, three minutes and 64 outstanding delayed samples. One final record and 100000 characters are reserved for final state; oversized final snapshots can still be omitted and are reported incomplete. Text and attribute strings are capped. Cross-origin ancestry terminates explicitly at inaccessible parents; navigation metadata provides browser frame parent IDs without bypassing access controls.

A caller can lower roots/nodes/children through the limits object on SPARK_INSPECT_TRACE_START (minimum 1, capped at defaults). This also controls subsequent deep snapshots in that frame. Normal UI uses defaults. Capture and event traversal remains limited to interaction snapshots; the existing document observer filters exercise/associated editor changes and does not keep a DOM dump. High-frequency movement is throttled.

Finite delay samples cannot guarantee observation of arbitrarily late rerenders. Keep recording active until the attempt settles; later mutation and final-state evidence can still expose changes. Feedback outside the interaction root may be absent. Missing declarations, duplicate labels, clipped state, missing before/after, partial event sequences, absent occupancy transitions and ambiguous frames require additional collection. A phase with no DOM actions cannot distinguish popup failure, mapping failure or apply omission.

## Local verification decision

Use dependency-free Node tests and offline export analysis now. The content-script tests use a synthetic DOM and controlled timers; they do not verify authenticated Chrome, framework internals, event trust semantics or live Solve success. Live Chrome collection remains necessary using the procedure above. No dependencies, extension manifest, release version or Solve-owned files are changed. Release authorization: NOT GRANTED.


## Verification performed

The final Inspector suite passed 36 tests with zero failures using:

    node --test --test-isolation=none tests/inspector-deep.test.cjs tests/inspector.test.js tests/inspector-frame-coverage.test.js tests/inspector-export.test.cjs tests/inspector-intelligence.test.cjs

The default test runner initially failed because sandboxed child-process spawning returned EPERM; the supported in-process isolation setting allowed the tests to run. Syntax checks passed for both Inspector scripts and both analysis utilities. Offline analysis of temporary copies of the two existing exports produced three focused reports and zero errors; SHA-256 comparisons confirmed both original files were unchanged. These observations are local verification only. Authenticated Chrome behavior was not tested. No external AI workers were used.


## Evidence reliability update

The 253dedff657d6f700b5a7a63 export was inspected directly. Its id-less root is present with a unique locator; root:null in older reports came from displaying only the HTML id. The manual session records only a pool-background click before the snapshot budget cuts off. Its endpoints nevertheless show an occupant moving from gap 4 to gap 2. This supports session-level occupancy change, not causality for any recorded action or answer correctness. Automated-session initial/final snapshots are unchanged and mousemove proves event-listener activity; historical MutationObserver attachment/health remains unknown.

Current reports expose distinct observation outcomes (no-action-observed, instrumentation-incomplete, observer-not-attached, state-change-observed, and actions-observed-no-net-state-change). Attachment, action presence, net state and mutation coverage are separate fields. Missing mutation records never prove no mutations when attachment or collection continuity is unavailable. New observation metadata includes original observer-target connectivity, root coverage, callback counts, filtered mutation counts, mutation scan clipping, snapshot budget/event/timer cutoff reasons and first-drop time. Mutations scan at most 120 entries per callback and store at most six summaries (two for rapid callbacks).

Action snapshots are compact and scoped to their root, retaining node identity, classes, selection, occupancy and connectivity. Pointerdown/mousedown/click on the same target are grouped when the recorded timing supports one activation. Source/destination attribution resolves nested handles and placeholders; a pool-background click is explicitly classified as such. New event entries carry recording session/frame context. Full grounded locator and child evidence remains in initial/final snapshots. Accessible root matching prefers om-text-gap over generic wrappers.

For a live retest, reload the extension and refresh the exercise tab. Wait until the correct frame is attached before acting: the real manual session spent roughly five seconds waiting for attachment. Record exactly one successful manual source-to-gap interaction, wait two seconds, and stop. Restore through normal Spark controls yourself. Record a separate automated attempt, noting UTC start/end and retaining the popup's reviewed actionability-block summary separately. Wait two seconds and stop. Export unchanged JSON and run node tools/analyze-inspector.cjs. Check observation.observerAttached, root counts, frame/session context, documentConnected, truncationReasons and firstDroppedMs. The popup's exact failed predicate remains outside Inspector access.

The updated focused suite passes 48 tests (12 additional tests relative to the prior 36-test baseline). These are synthetic/local tests and offline analysis of a real export, not a new authenticated Chrome observation. Release authorization remains NOT GRANTED.

## Occupancy recording efficiency

New traces declare stateEncoding `occupancy-v1`. Full initial/final boundaries remain unchanged. Action snapshots contain bounded source/destination occupancy and selection summaries. Repeated unchanged delayed samples use `action-sample` with `afterStateRef`, a zero-based index into the same frame events array. These samples assert observation equality, never causality. Existing action-before/action-after arrays remain readable by the offline analyzer; legacy exports are unchanged. Limits remain 360 events and 650000 serialized characters, with 100000 reserved for final state. This is a character budget, not UTF-8 bytes. Very large boundary snapshots can still exceed the reservation and are explicitly marked. Record a separate manual-reference trace for each removal/return and swap, pause after each transition, and stop promptly after the final state settles.
