# Nix packaging for the `kevinher7/t3code` fork

> **Status:** flake authored and evaluating; **not yet built** (hashes are
> placeholders). Resumable by a fresh agent — read this top to bottom.
>
> **Audience:** the maintainer of the `personal` branch on `kevinher7/t3code`,
> who runs a NixOS homelab + a nix-darwin MacBook and wants T3 Code installed
> declaratively (no Homebrew cask, no AppImage-by-hand).

---

## 1. Goal

Two consumers, both in a separate `nixos-config` flake (NOT this repo):

| Host                 | Platform         | What it needs                                                                                           | Why                                   |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `uribo-btw` (server) | `x86_64-linux`   | headless **`t3 serve`** behind nginx at `t3code.uribogoat.duckdns.org` (port 3773) as a systemd service | self-hosted web GUI for coding agents |
| `kebee` (MacBook)    | `aarch64-darwin` | the **desktop app** (`T3 Code (Alpha).app`)                                                             | local GUI                             |

Constraint: **we run our own fork**, so the Homebrew cask (`brew install --cask t3-code`)
and upstream release artifacts are off the table — everything must come from
`kevinher7/t3code`.

---

## 2. Investigation findings (so we don't relitigate them)

- **Upstream PR #2734 ("Add a flake.nix for NixOS Flake users")** does _not_
  build from source despite its description. It `fetchurl`s a prebuilt
  **x86_64-linux AppImage** from `pingdotgg` releases and wraps it with
  `appimage-run`. It exposes only `packages.x86_64-linux.default`, has **no CLI**
  and **no macOS**. Useful only as a reference for the AppImage-wrapping trick.
- **The fork has no published GitHub releases** (`gh release list --repo
kevinher7/t3code` is empty). The local `release/` dir has locally-built mac
  arm64 `.dmg`/`.zip`, but those are not fetchable URLs and `release/` is
  gitignored.
- **The CLI (`apps/server`, package name `t3`, bin → `dist/bin.mjs`) is a Node
  script, not the desktop GUI.** The server needs this, not the Electron app.
- **CLI build flow:** `turbo run build --filter=t3` builds `@t3tools/web` first
  (it's a workspace dep of `t3`), then runs `apps/server`'s build
  (`node scripts/cli.ts build` → `tsdown` bundle + copy `apps/web/dist` →
  `apps/server/dist/client`).
- **`tsdown` only inlines internal `@t3tools/*` packages** (`noExternal`); every
  npm dependency stays external, so the runtime needs the full `node_modules`
  shipped next to `dist/bin.mjs`.
- **Native / runtime gotchas:** `node-pty` is a native addon loaded at runtime
  via `import("node-pty")` (ESM resolution walks up from `dist/bin.mjs`, so
  `node_modules` must be an ancestor dir — NODE_PATH won't help).
  `@effect/sql-sqlite-bun` falls back to Node's built-in `node:sqlite` under
  Node.
- **Desktop artifact naming** (electron-builder effective config):
  `artifactName = "T3-Code-${version}-${arch}.${ext}"`, `productName = "T3 Code (Alpha)"`,
  `appId = com.t3tools.t3code`. mac targets: `dmg` + `zip`.
- **nix-darwin integration:** `nixos-config` host `kebee` already has an
  `activationScripts.aliasApplications` step that links
  `~/Applications/Home Manager Apps/*.app` into `~/Applications`. So a darwin
  derivation that drops `*.app` into `$out/Applications` integrates with **no
  Homebrew cask** — satisfies the constraint.

---

## 3. Decisions (locked)

1. **Hybrid sourcing.** Build the **CLI from source** (so the server self-rebuilds
   on fork changes); **fetch the prebuilt desktop** app (building Electron +
   mac code-signing from source in Nix is not worth it).
2. **Server delivery = dedicated `t3` CLI package** (not the desktop app's
   bundled server).
3. **Publish releases on the fork** and have the flake fetch the desktop `.zip`.
4. **No Linux desktop output for now** — only the CLI is used on Linux.
   (Deferred; see §7.)
5. **No Homebrew cask.**

---

## 4. Current state — `flake.nix` (this repo root)

Authored and **evaluates cleanly** on all outputs (`nix eval` of `.name`
succeeds). **Not built yet** — three hashes are `lib.fakeHash` placeholders.

Outputs:

| Attr                                  | `x86_64-linux`           | `aarch64-darwin`           |
| ------------------------------------- | ------------------------ | -------------------------- |
| `packages.<sys>.t3-cli` (= `default`) | ✅ built from source     | ✅ built from source       |
| `packages.aarch64-darwin.desktop`     | — (intentionally absent) | ✅ fetched `.zip` → `.app` |
| `apps.<sys>.default`                  | `t3`                     | `t3`                       |

Build design:

- **`nodeModules`** — a _fixed-output derivation_ running
  `bun install --frozen-lockfile` (FOD ⇒ network allowed; output hashed;
  system-specific because native addons differ). Toolchain provided:
  `bun`, `nodejs_24`, `python3`, `pkg-config`.
- **CLI derivation** — offline; copies `nodeModules`, runs
  `turbo run build --filter=t3 --no-daemon`, installs `dist/` + full
  `node_modules` under `$out/libexec/t3code`, and `makeWrapper`s
  `$out/bin/t3 → node …/dist/bin.mjs` (adds `nodejs` to PATH for child procs).
- **Desktop (darwin)** — `fetchurl` the `.zip`, `unzip`, copy `*.app` to
  `$out/Applications`.

### Things that must still be filled in / verified

The flake's top-of-file `MAINTENANCE NOTES` block lists these too.

1. **`bunDepsHashes.x86_64-linux` / `.aarch64-darwin`** — set to `fakeHash`. Run
   `nix build .#t3-cli` on each target system and paste the printed `got:` hash.
   **Build the linux one on the server (or a linux builder)** — it can't be
   built from the Mac.
2. **`desktopHashes.aarch64-darwin`** — needs a published release first (§5),
   then `nix store prefetch-file <zip-url>`.
3. **Risk: FOD reproducibility.** `bun install` may not be byte-reproducible. If
   the hash won't stabilize across builds, switch the `nodeModules` step to
   **`bun2nix`** (per-package hashing) — adds a flake input + a generated file
   but removes FOD nondeterminism.
4. **Risk: `node-pty` native build** inside the FOD may need more toolchain
   (it builds via node-gyp). Add to the FOD's `nativeBuildInputs` as needed.
5. **Risk: `node:sqlite` under `nodejs_24`** — if `t3 serve` errors on sqlite at
   runtime, add `--add-flags "--experimental-sqlite"` to the wrapper.

### Quick verification commands

```bash
cd ~/Projects/t3code
nix flake lock
nix eval --raw .#packages.aarch64-darwin.t3-cli.name      # darwin CLI
nix eval --raw .#packages.aarch64-darwin.desktop.name     # darwin desktop
nix eval --raw .#packages.x86_64-linux.t3-cli.name        # linux CLI
# real build (fills FOD hash on failure message):
nix build .#t3-cli            # run on the matching system / builder
```

---

## 5. Release CI — publishing desktop artifacts from the fork

### Why NOT reuse the existing `release.yml`

The inherited `.github/workflows/release.yml` is tag-driven and does far more
than we need: mac/linux/win matrix, **npm publish**, **Vercel deploy**,
**Discord announce**, a **GitHub App token** (`RELEASE_APP_ID` /
`RELEASE_APP_PRIVATE_KEY`), Apple/Azure **signing secrets**, and a `finalize`
job that **commits a version bump to `main`**. On the fork those secrets don't
exist (jobs fail/skip) and we explicitly want **`main` untouched** (it tracks
upstream). Don't reuse it.

### The plan: a slim, dedicated workflow

Create `.github/workflows/release-fork.yml` that:

- **Triggers on push to `personal`** (+ `workflow_dispatch` for manual runs).
- Builds **macOS arm64 only**, **unsigned**, on a **GitHub-hosted `macos-14`**
  runner (free for public repos — no Blacksmith).
- Computes a unique, semver-valid version and tag, then publishes a **GitHub
  Release** with the `.zip` (and `.dmg`) attached, using the default
  `GITHUB_TOKEN` (needs `permissions: contents: write`).

Versioning scheme (keeps the `T3-Code-${version}-${arch}.${ext}` filename and
makes each release unique + monotonic):

- `build-version = <pkg version>-fork.<run_number>` (e.g. `0.0.24-fork.7`)
- `tag = v<build-version>` (e.g. `v0.0.24-fork.7`)
- artifact = `T3-Code-0.0.24-fork.7-arm64.zip`

> The flake's desktop pin (`version` + `desktopHashes`) is updated **manually**
> per the maintenance notes, so the desktop release cadence and flake updates
> are decoupled — auto-publish often, bump the flake when you want a newer GUI.

Draft (review before committing — auto-creating releases on every push is an
outward-facing automation; confirm cadence first):

```yaml
name: Release (fork)
on:
  push:
    branches: [personal]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  desktop:
    runs-on: macos-14 # GitHub-hosted arm64; free for public repos
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - uses: oven-sh/setup-bun@v2
        with: { bun-version-file: package.json }
      - uses: actions/setup-node@v6
        with: { node-version-file: package.json }
      - run: bun install --frozen-lockfile

      - id: meta
        run: |
          base=$(node -p "require('./apps/desktop/package.json').version")
          version="${base}-fork.${{ github.run_number }}"
          echo "version=$version" >> "$GITHUB_OUTPUT"
          echo "tag=v$version"     >> "$GITHUB_OUTPUT"

      # Build mac arm64 dmg+zip, UNSIGNED (script disables CSC auto-discovery
      # when Apple secrets are absent).
      - run: |
          bun run dist:desktop:artifact -- \
            --platform mac --target dmg --arch arm64 \
            --build-version "${{ steps.meta.outputs.version }}" --verbose

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.meta.outputs.tag }}
          target_commitish: ${{ github.sha }}
          name: T3 Code ${{ steps.meta.outputs.version }} (fork)
          prerelease: true
          generate_release_notes: true
          files: |
            release/*.zip
            release/*.dmg
          fail_on_unmatched_files: true
          token: ${{ secrets.GITHUB_TOKEN }}
```

**Caveats to verify when this is enabled:**

- **Unsigned Gatekeeper:** the `.app` is unsigned. Even installed via Nix
  (fetchurl doesn't set the quarantine xattr), first launch may be blocked —
  clear with `xattr -dr com.apple.quarantine "<app>"` or allow in System
  Settings → Privacy & Security. If this is painful, add Apple Developer ID
  secrets later and pass `--signed`.
- **macOS runner minutes** are limited on private repos; this fork appears
  public, so they're free within fair-use limits.
- Confirm the `--build-version` value flows into the artifact filename exactly
  as `T3-Code-<version>-arm64.zip` (electron-builder requires valid semver;
  `-fork.N` is a valid prerelease identifier).

---

## 6. Wiring into `nixos-config` (separate repo, not done yet)

This is the original homelab plan; unchanged except the package source is now
this flake. Files in `~/nixos-config`:

| File                                          | Change                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flake.nix`                                   | add input `t3code.url = "github:kevinher7/t3code"; inputs.nixpkgs.follows = "nixpkgs";`                                                                                                  |
| `modules/services/t3code.nix` (new)           | `options.myHomelab.t3code.{enable,port}` (port default 3773); `systemd.services.t3code` running `${inputs.t3code.packages.${system}.t3-cli}/bin/t3 serve --host 127.0.0.1 --port <port>` |
| `modules/services/default.nix`                | import `./t3code.nix`                                                                                                                                                                    |
| `modules/services/nginx-proxy.nix`            | add `t3code.${domain}` to ACME `extraDomainNames` + vhost proxying `127.0.0.1:3773` with WebSocket upgrade headers                                                                       |
| `modules/services/homepage.nix`               | dashboard entry + `siteMonitor`                                                                                                                                                          |
| `hosts/server/default.nix`                    | `myHomelab.t3code.enable = true;`                                                                                                                                                        |
| `home/hosts/macbook.nix` (or a darwin module) | add `inputs.t3code.packages.${pkgs.system}.desktop` to `home.packages` so the `.app` is aliased into `~/Applications`                                                                    |

No DNS changes needed: Pi-hole `dnsmasq_lines` already resolves
`*.uribogoat.duckdns.org` to the Tailscale IP, and the DuckDNS wildcard cert
covers the new subdomain once added to `extraDomainNames`.

---

## 7. Deferred work

- **Linux desktop output (AppImage + `appimage-run`).** Not built — only the CLI
  is used on Linux today. **TODO: open a tracking issue** on `kevinher7/t3code`
  ("Add `packages.x86_64-linux.desktop` AppImage output to flake"). Pattern is
  the PR #2734 trick: `fetchurl` the `T3-Code-<version>-x86_64.AppImage`, wrap
  with `appimage-run`, and have the fork CI also build the linux target. When
  re-adding, restore `mkDesktopLinux` + the `x86_64-linux` entries in
  `desktopHashes` and the `desktop` system map in `flake.nix`.

---

## 8. Resume checklist

- [ ] Build CLI on each target system; capture real `bunDepsHashes`.
- [ ] (If FOD won't stabilize) migrate `nodeModules` to `bun2nix`.
- [ ] Smoke-test `t3 serve --host 127.0.0.1 --port 3773` from the built CLI
      (watch for `node-pty` / `node:sqlite` runtime errors → §4 risks).
- [ ] Add `.github/workflows/release-fork.yml` (§5); push to `personal`; confirm
      a release with the `.zip` appears.
- [ ] Fill `desktopHashes.aarch64-darwin` from the published `.zip`.
- [ ] Wire into `nixos-config` (§6).
- [ ] Open the Linux-desktop tracking issue (§7).
