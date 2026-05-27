# BMW M Design System

## Overview

BMW M's marketing surface is a near-pure black canvas (`{colors.canvas}` — #000) holding white BMW Type Next Latin headlines in **confident UPPERCASE**. The system has no decorative voltage of its own; brand energy comes from **full-bleed automotive photography** — cars cornering at speed, carbon-fiber wheel detail, driver cockpit shots, motorsport pit lanes — placed as edge-to-edge content that fills entire bands. UI chrome around the photography stays minimal: thin sans-serif copy, dividers as 1px hairlines (`{colors.hairline}`), all-caps button labels with no fill until hovered.

The **M tricolor stripe** — `{colors.m-blue-light}` (#0066b1) → `{colors.m-blue-dark}` (#1c69d4) → `{colors.m-red}` (#e22718) — appears sparingly as the brand's signature accent, used on the M wordmark, motorsport chrome, vehicle-tech callouts, and model badges. It is never a CTA color and never used as a background fill — the tricolor is exclusively a brand-identity marker.

Type voice runs **BMW Type Next Latin** in two cuts: regular for display + nav labels and Light for body + secondary copy. Display sizes use weight 700 (BMW's signature heavy-but-tight setting), while body type drops to weight 300 (Light). The contrast between heavy display and light body is the system's editorial signature.

**Key Characteristics:**
- Near-pure black canvas (`{colors.canvas}` — #000) with white type. The system inverts almost nothing — there is no light-mode marketing surface.
- Display headlines in UPPERCASE BMW Type Next Latin at weight 700. Sub-heads stay sentence-case at lighter weight.
- M tricolor (`{colors.m-blue-light}` / `{colors.m-blue-dark}` / `{colors.m-red}`) used as 4px brand-stripe dividers, M-wordmark accents, and motorsport chrome — never as buttons or fills.
- Photography fills entire bands edge-to-edge. Cars are always the visual subject; UI chrome backs off to small white labels overlaid on photography.
- Buttons are flat with `{rounded.none}` (0px) corners and uppercase letterspaced labels. The "industrial precision" rectangular silhouette IS the brand.
- Border radius is mostly zero across the system. The few exceptions: `{rounded.full}` on circular icon buttons (carousel arrows, chatbot launcher) and `{rounded.sm}` on a handful of small toggle pills.
- Spacing is generous and grid-aligned: `{spacing.section}` (96px) between major bands; `{spacing.xxl}` (64px) inside hero photo bands; `{spacing.xl}` (40px) inside content cards.

## Colors

### Brand & Accent
- **Primary** (`{colors.primary}` — #ffffff): The system's primary type and CTA color.
- **M Blue Light** (`{colors.m-blue-light}` — #0066b1): The first stop in the M tricolor stripe.
- **M Blue Dark** (`{colors.m-blue-dark}` — #1c69d4): The middle stop.
- **M Red** (`{colors.m-red}` — #e22718): The third stop.
- **Electric Blue** (`{colors.electric-blue}` — #0653b6): Electric-vehicle accent.

### Surface
- **Canvas** (`{colors.canvas}` — #000000): The default page floor. True black.
- **Surface Soft** (`{colors.surface-soft}` — #0d0d0d): Spec table cells and footer strips.
- **Surface Card** (`{colors.surface-card}` — #1a1a1a): Cards, secondary buttons, icon-button backgrounds.
- **Surface Elevated** (`{colors.surface-elevated}` — #262626): Nested cards inside dark bands.
- **Carbon Gray** (`{colors.carbon-gray}` — #2b2b2b): Technical-spec cards.

### Hairlines & Borders
- **Hairline** (`{colors.hairline}` — #3c3c3c): 1px divider tone on dark surfaces.
- **Hairline Strong** (`{colors.hairline-strong}` — #262626): Borders feel like one-step elevations.

### Text
- **Ink / On Dark** (`{colors.on-dark}` — #ffffff): All headline and primary text on dark canvas.
- **Body** (`{colors.body}` — #bbbbbb): Default running-text color.
- **Body Strong** (`{colors.body-strong}` — #e6e6e6): Emphasized body / lead paragraph.
- **Muted** (`{colors.muted}` — #7e7e7e): Footer links, breadcrumbs, captions.

### Semantic
- **Warning** (`{colors.warning}` — #f4b400): Technical-warning callouts.
- **Success** (`{colors.success}` — #0fa336): Order-confirmation states.

## Typography

### Font Family
**BMW Type Next Latin** is the licensed typeface. Fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
Open-source substitute: **Inter** (variable) at 700/300.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 700 | 1.0 | 0 | Hero h1 |
| `{typography.display-lg}` | 56px | 700 | 1.05 | 0 | Section heads |
| `{typography.display-md}` | 40px | 700 | 1.1 | 0 | Sub-section heads, model names |
| `{typography.display-sm}` | 32px | 700 | 1.15 | 0 | CTA-band heads |
| `{typography.title-lg}` | 24px | 700 | 1.3 | 0 | Card titles in 3-up grids |
| `{typography.title-md}` | 20px | 400 | 1.4 | 0 | Card sub-titles |
| `{typography.title-sm}` | 18px | 400 | 1.4 | 0 | Spec callouts |
| `{typography.label-uppercase}` | 14px | 700 | 1.3 | 1.5px | Category tabs, inline labels |
| `{typography.body-md}` | 16px | 300 (Light) | 1.5 | 0 | Default body |
| `{typography.body-sm}` | 14px | 300 (Light) | 1.5 | 0 | Footer body, fine print |
| `{typography.caption}` | 12px | 400 | 1.4 | 0.5px | Photo captions |
| `{typography.button}` | 14px | 700 | 1.0 | 1.5px | All button labels — uppercase |
| `{typography.nav-link}` | 14px | 400 | 1.4 | 0.5px | Top-nav menu items |

## Layout

### Spacing System
Base unit: 4px.
- `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px
- `{spacing.lg}` 24px · `{spacing.xl}` 40px · `{spacing.xxl}` 64px · `{spacing.section}` 96px

### Grid & Container
- Max content width: ~1440px centered
- Card grids: 3-up desktop, 2-up tablet, 1-up mobile

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | All buttons, cards, photos, inputs — dominant |
| `{rounded.xs}` | 2px | Legal CTAs only |
| `{rounded.sm}` | 4px | Toggle pills |
| `{rounded.md}` | 6px | Dropdown menu items |
| `{rounded.full}` | 9999px | Circular icon buttons, carousel arrows |

## Components

### Buttons
- **`button-primary`**: Black background, white text, 1px white border, 0px radius, 16px × 32px padding, 48px height. UPPERCASE 14px / 700 / 1.5px tracking.
- **`button-primary-outline`**: Transparent background, white outline only.
- **`button-icon`**: 48×48px circular, `{colors.surface-card}` bg, white icon.

### Cards
- **`feature-photo-card`**: `{colors.surface-card}` bg, 0px radius, 24px padding. 16:9 photo + category tag + title + body.
- **`spec-cell`**: `{colors.surface-soft}` bg, 0px radius, 24px padding. Value in `display-sm`, label in `label-uppercase`.

### Signature
- **`m-stripe-divider`**: 4px horizontal stripe, M tricolor (#0066b1 → #1c69d4 → #e22718). Used as dividers and brand-identity moments. NEVER as button fills.

## Do's and Don'ts

### Do
- UPPERCASE display headlines at weight 700
- Pair heavy display (700) with light body (300)
- Use `{rounded.none}` by default, `{rounded.full}` only for circular icon buttons
- Letter-space all-caps labels at 1.5px
- Reserve M tricolor for brand-identity moments only

### Don't
- Don't bold body type (stays at 300)
- Don't use rounded buttons
- Don't use gradient backdrops behind hero type
- Don't use M stripe as button fill or action surface
- Don't introduce colors outside the M tricolor + heritage blue palette

## Responsive

| Breakpoint | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Hamburger nav; hero h1 80→48px; 1-up grids |
| Tablet | 768–1024px | 2-up card grids |
| Desktop | 1024–1440px | Full nav; 3-up grids |
| Wide | > 1440px | Max content 1440px |
