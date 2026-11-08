# Log-in

Login page with three views, set against an animated 3D synthetic globe and
ambient strands blasting out to the left and right edges. Cobalt blue accent,
glass panels, light and dark themes.

**There is no auth and no backend here.** This is the front end only — nothing
is signed in, no request is sent, no state is stored. See
[Wiring it up](#wiring-it-up).

| View | Panel | Globe |
| --- | --- | --- |
| `login` | centre | centre |
| `forgot` | right | left |
| `terms` | left | right |

The panel and the globe slide in opposite directions, so they trade places
rather than collide, with a clear gap between them. Below 1150px there is no
room for that, and the views just swap in place.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Layout

Two folders, one per concern: the card you interact with, and the artwork
behind it. Each has an `index.ts` naming what the rest of the app may import;
everything else in the folder is internal to it.

```
src/
├── app/
│   ├── globals.css          Tailwind, token import, reset
│   ├── layout.tsx           Fonts, metadata, theme-color
│   └── page.tsx             Renders <AuthStage />
├── components/
│   ├── auth/                The card and its three views
│   │   ├── index.ts           → AuthStage
│   │   ├── AuthStage.tsx      View state, panel switching, focus
│   │   ├── AuthStage.module.css    Stage layering, per-view offsets
│   │   ├── AuthPanel.module.css    Glass card and controls, shared
│   │   ├── LoginForm.tsx
│   │   ├── ForgotPasswordForm.tsx
│   │   └── TermsPanel.tsx     Terms copy — edit the TERMS array
│   └── backdrop/            The animated artwork
│       ├── index.ts           → AmbientLines, GlobeField
│       ├── GlobeField.tsx     Public entry; code-splits the renderer
│       ├── GlobeCanvas.tsx    The Three.js renderer itself
│       ├── build-globe.ts     Globe geometry (no Three.js)
│       ├── theme-colors.ts    Reads the canvas palette off :root
│       └── AmbientLines.tsx   2D canvas strands
└── styles/
    └── tokens.css           Every colour and glass value, both themes
```

`GlobeCanvas` and `build-globe` are deliberately unexported: reaching the
globe through `GlobeField` is what keeps Three.js out of the first bundle.

Three layers stack at the same centre: the strand canvas at `z-index: 0`, the
globe at `1`, and the card at `2`. Each view's offsets live in two custom
properties, `--stage-x` and `--globe-x`, set per `data-view` on the shell — so
retuning the movement is a CSS edit, not a JS one.

## The glass

The card is a pane, not a fill. Four tokens do the work, all defined per theme
in `styles/tokens.css`:

| Token | Role |
| --- | --- |
| `--glass-bg` | The tinted gradient body, 40–75% opaque |
| `--glass-border` | The hairline edge |
| `--glass-highlight` | An inset top edge, so light appears to catch the rim |
| `--glass-sheen` | An angled wash across the top-left corner, drawn by `.card::before` |

Those sit on `backdrop-filter: blur(28px) saturate(1.6)`, which is what makes
the globe bend behind the panel instead of merely showing through it. Where
`backdrop-filter` is unsupported there is nothing to blur, so an `@supports`
block swaps in `--glass-fallback`, an opaque pane that carries its own
contrast.

All three panels render at once, stacked absolutely and crossfaded. Because
they are out of flow, `AuthStage` measures the active one and sets the card's
height, which is what makes it grow and shrink smoothly between views instead
of snapping. Inactive panels carry `inert`, keeping them out of the tab order
and off the accessibility tree while faded out, and focus moves to the new
panel's heading on every switch.

## Theming

Every colour is a CSS custom property on `:root` in `styles/tokens.css`, redefined for
dark under both `prefers-color-scheme` and `[data-theme="dark"]`. The accent is
cobalt `#0047AB` in light, lifted to `#3D7BFF` in dark so it stays readable on a
near-black background. To re-tint, edit `--accent`, `--accent-hover`,
`--accent-active`, `--accent-ring` and `--accent-soft`.

Both canvases read `--net-*` live and repaint when the scheme or `data-theme`
changes, so they follow along with no JS edits. Setting `data-theme="light"` or
`"dark"` on `<html>` pins the theme; with the attribute absent it follows the OS.

## The globe

`buildGlobe()` returns six independent layers, each with its own opacity weight
and drift amount in `GlobeField.tsx`:

| Layer | What it draws |
| --- | --- |
| `surface` | ~2,600 candidate dots spread over the sphere by a Fibonacci lattice, then thinned by a noise field so they clump into patches instead of an even stipple. Denser patches carry the fatter dots. |
| `grid` | Seven latitude rings and ten meridians on the sphere. Meridians fade toward the poles, where they all bunch together. |
| `web` | 230 coarse nodes on the sphere that take part in the link graph. |
| `links` | Links between web nodes within 40% of the radius, opacity falling off with distance. The surface dots are excluded, or the globe would turn into a solid mesh. |
| `arcs` | Long sweeping orbits outside the sphere on randomly tilted planes, tapered at both ends so they dissolve instead of stopping dead. |
| `dotted` | Closed squiggle loops drawn as dots in the accent colour, radius-modulated to make them loop rather than circle. |

Animation runs entirely in the vertex shaders: every vertex carries a drift seed,
and both endpoints of a line share one seed, so everything evaluates the same
`drift()` function and stays welded together with zero per-frame buffer uploads.
A `uDrift` uniform scales it per layer — the globe's skin barely moves while the
orbits wander. The camera is orthographic and nothing is lit; depth shows up only
as opacity and dot size, which keeps the flat ink-on-paper look.

## The ambient strands

Strands launch from a narrow band down the centre, behind the globe, and travel
near-horizontally out toward whichever edge they picked. Each is drawn as a
gradient streak that dissolves behind its head, and each lives just long enough
to clear the edge before respawning. They are pre-warmed four seconds on mount —
trails are built from travelled distance, so a cold start would show a field of
lone dots.

## Performance and accessibility

Both canvases pause when offscreen or when the tab is hidden. Under
`prefers-reduced-motion: reduce` they render a single developed frame and stop.
If WebGL is unavailable the globe is skipped rather than throwing.

The forms have labels tied to inputs, visible focus rings, and an eye toggle
that is a real button with `aria-pressed`. Field checking is left to the
browser through `required`, `type="email"` and `minlength`, styled with
`:user-invalid` so nothing turns red before it has been filled in.

## Wiring it up

Each form takes one optional prop:

```tsx
<LoginForm onSubmit={(data) => signIn(data.get("email"), data.get("password"))} />
<ForgotPasswordForm onSubmit={(data) => requestReset(data.get("email"))} />
```

Without it, submitting calls `preventDefault` and does nothing. The fields are
uncontrolled, so the handler reads them from the `FormData` it is given:
`email`, `password`, `keepLoggedIn`.

There is no pending, error or success UI, because a real one depends on how
your API reports those. Two things to get right when you add it:

- **Do not confirm whether an email exists.** A reset form that says "no such
  account" tells anyone who can reach it which addresses are registered. Say
  "if an account exists for that address, a link is on its way" either way.
- **Announce the result.** Put the outcome in an `aria-live="polite"` region
  and disable the submit button while the request is in flight.
