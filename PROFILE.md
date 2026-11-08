# How this profile is built

`README.md` and everything in `generated/` are built by a script. Don't edit them by hand.

- **Words, projects, roles, links:** edit `profile.config.json`. `{contributions}` and `{repos}` are filled from GitHub.
- **Generator:** `scripts/build.mjs`, Node standard library only. Run `node scripts/build.mjs`.
- **Images:** project screenshots in `assets/projects/`, logos in `assets/logos/`.
- **Fonts:** Gochi Hand, Instrument Sans and Geist Mono, embedded into each panel. SIL Open Font License, see `fonts/OFL-*.txt`.
- **Updates:** `.github/workflows/refresh.yml` rebuilds daily and whenever the config or script changes. If GitHub can't be reached, the last good numbers in `data/cache.json` are used.
