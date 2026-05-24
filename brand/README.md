# Fours & Eights — Brand Assets

The primary mark for the Fours & Eights card game. Use these assets across
the website, social posts, app icons, and any merchandise.

## Files

```
brand/
├── fours-and-eights-logo.svg            ← MASTER (full logo, felt bg)
├── fours-and-eights-logo-transparent.svg ← MASTER (full logo, transparent)
├── fours-and-eights-mark.svg            ← MASTER (compact monogram)
├── primary/                             ← Full logo PNG (felt bg)
├── transparent/                         ← Full logo PNG (transparent)
├── mark/                                ← Compact monogram PNG
├── favicon/                             ← Browser tab icons (PNG + ICO)
├── app-icons/                           ← PWA / iOS / Android icons
├── social/                              ← OpenGraph / Twitter card
└── banner/                              ← Website header
```

## Which file to use where

| Use case | File | Notes |
|---|---|---|
| Lobby splash, splash screens | `primary/fours-and-eights-1024.png` or larger | |
| Print, merch, posters | SVG master (any size) | Infinite resolution |
| Place over photo / non-green bg | `transparent/fours-and-eights-trans-1024.png` | |
| Site header logo | `mark/fours-and-eights-mark-512.png` | Or render the SVG inline |
| Browser tab | `favicon/favicon.ico` | Multi-resolution 16/32/48 |
| iOS Home Screen | `app-icons/apple-touch-icon.png` | 180×180 |
| Android Home Screen | `app-icons/icon-512.png` + `icon-maskable-512.png` | Both for adaptive icons |
| PWA install icon | `app-icons/icon-192.png` and `icon-512.png` | Referenced in manifest.json |
| Social link previews | `social/og-card-1200x630.png` | OpenGraph + Twitter |
| Email signature / blog header | `banner/banner-1600x400.png` | |

## How to use the SVG masters

The SVG files reference EB Garamond as the primary typeface (the same one
your site loads from Google Fonts). When you embed the SVG in a page that
has EB Garamond loaded, it renders with the intended typeface. Otherwise it
falls back to Georgia.

The PNG renders in this pack use DejaVu Serif (the closest available serif
during generation) — they look 95% identical to EB Garamond but aren't
pixel-perfect. For the highest fidelity, generate fresh PNGs from the SVGs
using a tool that has EB Garamond installed (Figma, Affinity Designer, or
Inkscape with the font).

## Color palette

| Name | Hex | Use |
|---|---|---|
| Felt | `#0c2418` | Background |
| Gold (highlight) | `#ffe9a8` | Gradient top stop |
| Gold (mid) | `#c49a57` | Solid accents, hairlines |
| Gold (deep) | `#5e451d` | Gradient bottom stop |
| Soft gold top | `#e8c178` | Suit ornaments, secondary |
| Soft gold bottom | `#8c6628` | Secondary text |
| Card face | `#fffbe9` | Light surfaces |
| Ink | `#15171a` | Card text |

## Typography

- **Primary**: EB Garamond (serif, 400/600/700, regular and italic)
- **Body / UI**: Inter (sans, 400/500/600/700)
- **Mono / labels**: JetBrains Mono

All three load from Google Fonts; already imported in `styles/globals.css`.

## Don't do this

- Don't recolor the gold to a flat tone — the gradient is part of the mark
- Don't add a stroke around the type
- Don't place the felt-background version on another colored background
  (use the transparent version instead)
- Don't squish or stretch the logo non-uniformly
- Don't use a different typeface for "FOURS & EIGHTS" in the footer
