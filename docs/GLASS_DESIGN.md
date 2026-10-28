# Liquid Glass / Hallmark design notes — v0.5.0

## Product and context

studymate is a small, opt-in workflow tool embedded in the Chrome extension surface, not a marketing website. Users need to identify the active exercise, inspect proposed answers, and deliberately decide whether to apply or check them. Settings must accommodate sensitive API configuration without implying that the app is handling credentials as a vault.

**User request:** Apple-inspired Liquid Glass, not a generic blue dashboard. Give the user full control of the background, similar to Discord's palette/advanced picker experience, without introducing remote runtime dependencies. Preserve all solving and submission safeguards.

## Reference and rationale

Reference: [Nutlope / Hallmark](https://github.com/nutlope/hallmark), especially the [slop test](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/slop-test.md), [responsive](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/responsive.md), [typography](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/typography.md) and [microinteractions](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/microinteractions.md) references.

The two surfaces intentionally have different structures:

- **Popup — Glass command deck**: fixed 388px intrinsic document width; header with scan/settings utilities, the exercise heading as the visual anchor, a contained question list, and a single consolidated action dock. The onboarding hero disappears once an exercise is detected. Controls are not repeated in multiple cards.
- **Settings — Chromatic atelier**: persistent (desktop) translucent navigation; grouped preference rows; large, interactive color lab; and a bounded floating Save action. The studio is the visual centre because color choice is the task, not an ornamental illustration.

These are distinct from v0.4.x's "onboarding card → stepper → equal card grid" composition. They keep the same content and IDs required by the JavaScript.

## Materials and visual rules

- **Glass** is implemented with `backdrop-filter: blur(...) saturate(...)`, semitransparent background tokens, a one-pixel lit edge, subtle inset specular shadows and restrained response to pointer movement. The material is approximated with browser CSS; there is **no promise of native Apple APIs**.
- **Colored wallpaper** is a functional consequence of the chosen background color (`--wall-rgb`, `--wall-strength`) and is intentionally visible behind translucent sheets. There is one color source; no unrelated animated mesh gradients.
- **Typography** is optimized for the user's Apple/iOS preference: SF on Apple systems, Segoe UI Variable on Windows, and a monospaced face only for technical fields. Display weights and line heights are distinct; there is no imported font.
- **Spacing** follows a named 4px unit system. Foreground action color remains an independent semantic accent so even an arbitrary wallpaper hue cannot overwrite the meaning of controls.
- **Motion** communicates input hover/focus and selected state. Focus rings do not animate; the hue picker supports keyboard input. `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast: more` have fallbacks.

## Color model and privacy

A saved local color must be exactly `#[0-9a-f]{6}`. Intensity is clamped to 0..100. CSS receives only sanitized RGB channels and color values, avoiding arbitrary style injection. Editing is a preview until Save; keys are unaffected. The nine presets are suggestions rather than an enforced palette. The hue ring, HEX field and browser-native color input accept arbitrary colors.

State persists in `chrome.storage.local` as `uiBackdropColor` and `uiBackdropStrength`. The popup listens for changed preferences, re-applying the wallpaper when the color changes. Theme selection remains independent: system, light, dark.

## Accessibility and interaction checklist

- All core action buttons remain real `<button>` elements; checkbox/radio controls remain native inputs.
- Active swatches expose `aria-pressed`, labels in all four UI languages and a visible selected outline.
- Hue ring has slider semantics, value announcement, arrow keys, Shift+arrow and Home/End.
- HEX input shows an invalid state and reverts incomplete input on blur.
- All text/control surfaces have distinct light/dark colors, with high-contrast and reduced-transparency fallback.
- Viewports tested: options at 320, 375, 414, 768 and 1280 CSS px, plus popup fixed width 388px. No horizontal overflow in local Chromium renders.
- No marketing claims, placeholder metrics, autoplay, unrelated decoration, or 3-column feature-card grid.

## Hallmark self-evaluation

Design intent: **P5 / H5 / E4 / S5 / R4 / V5**, with execution and restraint left at 4 rather than claiming a perfect score. A fully automated audit of all Hallmark rules was not run; this is a focused self-review with screenshots and functional tests. The area still needing live user validation is Chrome's own popup sizing and feel on the user's monitor/Windows scaling. Live Spark submission mechanics are unchanged and remain experimentally guarded.

## What was not changed

`content.js`, API providers, endpoint permission gates, the AI solver, offline fallback and safety guards for submit/next retain their established behavior. The popup is rearranged structurally but keeps the identifiers used by `popup.js`.
