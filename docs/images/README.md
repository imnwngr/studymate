# Visual asset provenance

The hero and workflow SVGs are original documentation artwork, not screenshots. The violet/indigo palette follows the requested dark-tech direction; cyan distinguishes the independent observation path. Gradients separate foreground panels from the dark canvas. The artwork uses system fonts, no scripts, embedded HTML, external images or remote fonts. ENERGY 2 / RHYTHM 2 / MOTION 0: static, restrained artwork with the extension panel as the focal point.

The seven WebP images are genuine Chrome captures of the repository's actual HTML/CSS/JS, served locally with mocked Chrome APIs. They are **not installed-extension or authenticated Spark screenshots**. No production markup, CSS or application logic was changed to make these images. Popup images show an empty exercise with a pending scan. Settings uses default appearance preferences and no provider profiles or keys. Inspector is idle with no recordings; `example.invalid` and tab 42 are dummy fixture identifiers, not private URLs or sessions. All captures use the English interface. The four styles are the actual product styles, not recolored mockups.

| Asset | Source / capture |
| --- | --- |
| `hero.svg` | Original product illustration, 1440 × 690 |
| `workflow-mobile.svg` | Original vertical workflow for narrow viewports, 680 × 1270 |
| `workflow.svg` | Original supported-Apply workflow and separate Inspector path, 1440 × 600 |
| `popup.webp`, `popup-light.webp` | Ventrix popup, 400 × 640, dark/light |
| `style-editorial.webp` | Chainsaw Editorial popup, 400 × 640, light |
| `style-cognify.webp` | Cognify popup, 400 × 640, dark |
| `style-insightos.webp` | InsightOS popup, 400 × 640, dark |
| `settings.webp` | Settings, 1100 × 850, light |
| `inspector.webp` | Idle Inspector, 1100 × 1080 |

WebP captures use quality 90. Images contain only browser-rendered pixels; no EXIF/XMP or authentication data is added. GitHub serves these local relative assets. Explicit SVG backgrounds remain legible in both GitHub themes; popup uses a light-mode `<picture>` source. Gallery screenshots intentionally retain each captured style/theme.

To reproduce with installed Chrome and Node.js (no packages):

```powershell
node tools/capture-readme.cjs
node --test --test-isolation=none tests/readme-assets.test.cjs
```

The capture utility reuses the existing synthetic Chrome/CDP harness. It writes only documentation images; temporary browser profiles remain under the OS temp directory, outside Git. It does not connect to Spark or a provider. Do not replace these images with recordings or screenshots from a personal browser profile.
