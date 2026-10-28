# studymate Inspector (local v0.8.0 candidate)

The extension version is 0.8.0. Inspector schema versions remain independent.

## Use

1. Reload the unpacked extension at `chrome://extensions`.
2. Select an ordinary HTTP(S) website tab and open studymate's popup.
3. Click Inspector. Check the displayed tab ID and origin.
3. Click Start recording. Interact on the original tab, then Stop recording.
4. Export JSON. Use the existing exports-directory picker or explicit Save As/download workflow.
5. Review the export before sharing. Run the local analyzer if needed:

```powershell
Set-Location 'C:\projects\studymate'
node tools/analyze-inspector.cjs
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-inspector-universal.cjs
```

Inspector sends only `SPARK_INSPECT_*` messages. It does not load Solve modules during on-demand injection, select answers, submit, or access teacher endpoints.

## Tab and frame lifecycle

- A session remains bound to the tab chosen when Inspector opened. Switching active tabs does not retarget it.
- Top-level navigation/reload or tab closure stops recording. Only the most recent cached evidence, polled every 850 ms, may survive document destruction; the last 850 ms or an in-flight message may be unavailable. Missing final boundaries are explicit.
- Start again explicitly after navigation. Cross-origin navigation may revoke temporary access; reopen Inspector from the source tab if necessary.
- Child-frame reloads reattach while recording, preserving prior generations separately by frame and instance IDs. Identical frame URLs do not merge documents.
- Chrome Web Locks prevent another Inspector window from recording the same tab. An already-active frame is rejected rather than claimed by another session.
- Closing Inspector requests recorder shutdown. Browser page teardown can interrupt that message; content recorders independently stop after three minutes.

## Permissions

The existing optional HTTPS host declaration permits exact-origin requests; this implementation adds no all-site grant or new host permission. `activeTab` covers temporary access to the top-level origin, not arbitrary cross-origin frames.

Frame diagnostics list accessible and inaccessible documents. **Allow inaccessible frame origins** requests the listed HTTPS origins (or already-declared localhost origins) from a user click. Denial does not block accessible siblings. Ordinary cross-origin HTTP frames can remain unavailable because no broad HTTP optional permission was added. Restricted Chrome pages, the Web Store, closed Shadow DOM, and sandboxed frames Chrome refuses to inject remain unsupported.

See [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions).

## Adapters and privacy

- NGL retains its deep interaction, QTI reference, Word Pool, checkbox and Linking Lines evidence through the existing recorder. Literal input/textarea/contenteditable values and their mutation old values are redacted. NGL exercise text, identifiers and selected choice evidence remain; review before sharing.
- Generic recording collects node IDs, tags, control types, checked states, selected option indexes, event types and bounded mutation summaries. It does not collect page HTML, arbitrary text, literal typed values, URLs with query strings, or application JavaScript. Secret/payment controls are explicitly redacted.
- Open Shadow DOM is observed when discovered at start or through added subtrees. Up to 32 roots are observed; discovery scans are bounded. A shadow root attached later to an existing host without any observable DOM mutation may be missed. Composed events can still reach the document. Closed roots remain unavailable.
- Submission events and controls are structural observations, never claims of a saved score or correct answer.

## Schema and bounds

Exports add `schemaVersion: "2.0"`, session, site, frames, flattened events, diagnostics, warnings and summary. The existing `tool`, trace `version: "3.4.0"`, `deepSchema`, captures, recordings and coverage fields remain for older analyzers. Generic events identify session, frame, document instance and node; `before: null` means no observed prior state, not a confirmed transition.

The generic recorder uses 600 records and a 300,000-byte UTF-8 budget, reserving 150,000 bytes for a bounded final snapshot. Snapshots retain up to 100 controls and report total/clipped counts. Select state retains up to 20 selected indexes with an explicit clipping flag. Drop counts and truncation reasons are explicit. NGL retains its 360-event/650,000-character budget and occupancy-v1 encoding. The coordinator caps discovered frames at 32, document generations at 64, saved recordings at eight, captures at eight, and pretty-printed export JSON at 24 MB. Export refuses oversized data rather than silently omitting evidence. Keep diagnostic sessions short; limits are not completeness guarantees.

The offline analyzer continues to support legacy NGL exports. Generic records are useful structural evidence; the existing analyzer is NGL-focused and cannot infer missing QTI answers or platform-specific correctness from generic events.

## Live acceptance checks

1. NGL: record radio/checkbox and a Word Pool return-to-pool/refill. Confirm deep evidence and that Inspector itself changes no answers. Separately check existing Solve.
2. Unknown website: record a checkbox, select and text input. Confirm events and that typed sentinel text is absent from JSON.
4. Switch tabs during recording: confirm all events retain the original tab ID.
5. Reload the source: confirm recording stops and cached evidence is marked partial; start again explicitly.
6. Open a second Inspector for the same tab: confirm duplicate recording is blocked.
6. Deny one frame-origin request: confirm the inaccessible frame remains visible and accessible frames still record.

These require user testing on the authenticated sites. Synthetic fixtures do not establish live compatibility.
