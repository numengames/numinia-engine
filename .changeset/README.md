# Changes waiting for a release

Every pull request that changes how the engine behaves leaves **one file of its own** in this folder. It never moves the
version number, never writes in `docs/RUNLOG.md` and never touches `apps/plaza/novedades-datos.ts`: those are the lines
every pull request used to fight over, so the first to merge left the others in conflict.

The format is the one of [Changesets](https://github.com/changesets/changesets) (we do not install it; the small tool
`tools/juntar-cambios.mjs` reads the same files, so the official CLI can replace it later without touching a fragment).

## Your fragment

Name it after your branch: branch `feat/evidence-markers` → `.changeset/feat-evidence-markers.md`. Two branches never
share a name, so two fragments never share a file.

```
---
"numinia-engine": minor
---

## 2026-11-04 07:10 · <topic> · <title> · hecho
- Qué: …
- Números: …
- Consumo: sin medir · <model>.
- Cambio: minor. Commit: branch `feat/evidence-markers`, PR #….
- Siguiente: …
```

- The top part names the package (`name` in `package.json`) and the jump: `patch` (a fix that asks nothing new),
  `minor` (something new that breaks nothing), `major` (something that stops working as yesterday). Before 1.0.0 a
  `major` is applied as a minor ([`docs/VERSIONES.md`](../docs/VERSIONES.md)).
- The body is the diary entry, in Spanish, in the format at the top of `docs/RUNLOG.md`: heading
  `## AAAA-MM-DD HH:MM · tema · título · hecho|bloqueada|en curso` (time in UTC, from `date -u '+%Y-%m-%d %H:%M'`) and
  its lines. The line `- Qué:` is what the news bar of the page shows. Do not write a version number in it: nobody knows
  it until the release.
- `npm run cambios:juntar -- --comprobar` checks every fragment and says which version would come out. `npm test`
  checks them too (`test/cambios.test.ts`).

## The release (maintainers)

When several pull requests have merged, one pull request `chore(release): x.y.z` runs `npm run cambios:juntar`: it takes
the highest jump of all fragments, writes the version once in `package.json` and `package-lock.json`, appends the
entries to `docs/RUNLOG.md` in the order of their heading's time, deletes the fragments and regenerates the news. Nothing
else is in that pull request.

`README.md` and `config.json` in this folder are not fragments.
