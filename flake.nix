{
  description = "T3 Code — a harness for coding agents (CLI built from source + prebuilt desktop app)";

  # ===========================================================================
  # MAINTENANCE NOTES
  # ---------------------------------------------------------------------------
  # This flake is "hybrid":
  #   * packages.<system>.t3-cli  -> the headless `t3` CLI, BUILT FROM SOURCE
  #                                  (this repo). Used by the NixOS server to
  #                                  run `t3 serve`.
  #   * packages.aarch64-darwin.desktop -> the Electron desktop app, FETCHED as
  #                                  a prebuilt artifact (mac .zip) from THIS
  #                                  FORK's GitHub releases.
  #
  # NOTE: A Linux desktop output (AppImage + appimage-run) is intentionally NOT
  # provided yet — only the CLI is used on Linux. Tracked for later; see
  # docs/nix-packaging.md ("Deferred work").
  #
  # When you cut a new release (tag `vX.Y.Z` on kevinher7/t3code with the
  # electron-builder artifacts attached), update the four things below:
  #
  #   1. `version`               -> e.g. "0.0.25"
  #
  #   2. `desktopHashes`         -> hash of the fetched desktop artifact:
  #        nix store prefetch-file --json \
  #          https://github.com/kevinher7/t3code/releases/download/v0.0.25/T3-Code-0.0.25-arm64.zip
  #
  #   3. `bunDepsHashes`         -> hash of the fixed-output node_modules build,
  #        one per system. Set to lib.fakeHash, run the build, and copy the
  #        "got:" hash Nix prints into the matching slot:
  #          nix build .#t3-cli            # on the target system / builder
  #
  #   4. `flake.lock`            -> `nix flake update` to refresh nixpkgs.
  # ===========================================================================

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      lib = nixpkgs.lib;

      # ---- Release coordinates ----------------------------------------------
      owner = "kevinher7";
      repo = "t3code";
      version = "0.0.24";
      releaseTag = "v${version}";

      # electron-builder artifactName: "T3-Code-${version}-${arch}.${ext}"
      # (productName inside the bundle: "T3 Code (Alpha)").
      desktopArtifactUrl =
        arch: ext:
        "https://github.com/${owner}/${repo}/releases/download/${releaseTag}/T3-Code-${version}-${arch}.${ext}";

      # ---- Hashes to maintain (see notes above) -----------------------------
      desktopHashes = {
        aarch64-darwin = lib.fakeHash; # T3-Code-${version}-arm64.zip
      };

      bunDepsHashes = {
        x86_64-linux = lib.fakeHash;
        aarch64-darwin = "sha256-OWHMBirGRbmEO6ASo06jm0Fn1m4yTkKItHaEnUhoSSw=";
      };

      # CLI builds on these; desktop is fetched only where an artifact exists.
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];

      forAllSystems = lib.genAttrs systems;
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

      # =======================================================================
      # CLI (built from source)
      # =======================================================================
      mkCli =
        system:
        let
          pkgs = pkgsFor system;
          nodejs = pkgs.nodejs_24;

          # --- Step 1: node_modules as a fixed-output derivation --------------
          # bun resolves the workspace (catalogs, overrides, patchedDependencies)
          # and builds native addons (node-pty). FODs get network access; the
          # output is hashed, so it is system-specific (native binaries differ).
          nodeModules = pkgs.stdenv.mkDerivation {
            pname = "t3code-node-modules";
            inherit version;
            src = self;

            nativeBuildInputs = [
              pkgs.bun
              nodejs
              pkgs.python3 # node-gyp for node-pty
              pkgs.pkg-config
              pkgs.cacert # TLS roots for postinstall downloads inside the FOD
            ];

            dontConfigure = true;
            dontFixup = true;

            buildPhase = ''
              runHook preBuild
              export HOME=$TMPDIR
              export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache

              # The FOD sandbox has no CA bundle by default; postinstall scripts
              # (e.g. electron via node's `got`) fail cert verification without it.
              export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
              export NODE_EXTRA_CA_CERTS=$SSL_CERT_FILE

              # The `t3` CLI never uses Electron — skip its (large, network-only)
              # binary download. Avoids unnecessary network + keeps the FOD lean.
              export ELECTRON_SKIP_BINARY_DOWNLOAD=1

              bun install --frozen-lockfile --no-progress
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              # bun's isolated linker creates a node_modules dir per workspace
              # package (root, apps/*, packages/*, scripts) with relative
              # symlinks into the root .bun virtual store. Capture every one at
              # its relative path — saving only the root node_modules drops e.g.
              # apps/web/node_modules/.bin/vite and the offline build can't run.
              find . -type d -name node_modules -prune -print0 \
                | while IFS= read -r -d "" d; do
                    mkdir -p "$out/$(dirname "$d")"
                    cp -R "$d" "$out/$(dirname "$d")/"
                  done
              runHook postInstall
            '';

            outputHashMode = "recursive";
            outputHashAlgo = "sha256";
            outputHash = bunDepsHashes.${system};
          };
        in
        # --- Step 2: offline build (turbo -> web + server bundle) ------------
        pkgs.stdenv.mkDerivation {
          pname = "t3code-cli";
          inherit version;
          src = self;

          nativeBuildInputs = [
            nodejs
            pkgs.bun # turbo shells out to the declared package manager (bun)
            pkgs.makeWrapper
          ];

          dontConfigure = true;

          buildPhase = ''
            runHook preBuild
            export HOME=$TMPDIR
            export TURBO_TELEMETRY_DISABLED=1
            export DO_NOT_TRACK=1

            # Restore every pre-resolved workspace node_modules tree (root +
            # apps/*, packages/*, scripts) into its matching path. bun's
            # isolated layout uses relative symlinks between them, so the
            # directory layout must be reproduced exactly (writable copies).
            for d in $(cd ${nodeModules} && find . -type d -name node_modules -prune); do
              mkdir -p "$(dirname "$d")"
              cp -R "${nodeModules}/$d" "$d"
              chmod -R u+w "$d"
            done

            # `t3` depends on @t3tools/web, so this also runs the web build first,
            # then apps/server's `node scripts/cli.ts build` (tsdown + copy client).
            ./node_modules/.bin/turbo run build --filter=t3 --no-daemon
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/libexec/t3code/apps/server

            # tsdown leaves all npm deps external, so bin.mjs resolves them at
            # runtime by walking up from its own location. bun's isolated layout
            # puts apps/server's deps in apps/server/node_modules as relative
            # symlinks (../../../node_modules/.bun/...) into the root virtual
            # store — so the real relative layout must be reproduced:
            #   apps/server/dist/bin.mjs  ->  apps/server/node_modules  ->  node_modules/.bun
            # (node-pty's native addon and node:sqlite fallback included).
            cp -R node_modules $out/libexec/t3code/node_modules
            cp -R apps/server/dist $out/libexec/t3code/apps/server/dist
            cp -R apps/server/node_modules $out/libexec/t3code/apps/server/node_modules

            # tsdown inlines every @t3tools/* (and effect-*) workspace package
            # into bin.mjs, so their node_modules symlinks point at source dirs
            # we deliberately don't ship — drop the now-dangling links (unused at
            # runtime; they'd otherwise fail the noBrokenSymlinks fixup check).
            find $out/libexec/t3code -xtype l -delete

            makeWrapper ${nodejs}/bin/node $out/bin/t3 \
              --add-flags "$out/libexec/t3code/apps/server/dist/bin.mjs" \
              --prefix PATH : ${lib.makeBinPath [ nodejs ]}
            runHook postInstall
          '';

          meta = {
            description = "T3 Code headless CLI (`t3 serve`)";
            homepage = "https://t3.codes";
            license = lib.licenses.mit;
            mainProgram = "t3";
            platforms = systems;
          };
        };

      # =======================================================================
      # Desktop app (prebuilt artifact from this fork's releases)
      # =======================================================================

      # macOS: unpack the signed .zip and expose the .app so home-manager /
      # nix-darwin can link it into ~/Applications.
      mkDesktopDarwin =
        system:
        let
          pkgs = pkgsFor system;
        in
        pkgs.stdenv.mkDerivation {
          pname = "t3code-desktop";
          inherit version;

          src = pkgs.fetchurl {
            url = desktopArtifactUrl "arm64" "zip";
            hash = desktopHashes.${system};
          };

          nativeBuildInputs = [ pkgs.unzip ];

          sourceRoot = ".";
          unpackPhase = "unzip -q $src";

          installPhase = ''
            runHook preInstall
            mkdir -p "$out/Applications"
            cp -R *.app "$out/Applications/"
            runHook postInstall
          '';

          meta = {
            description = "T3 Code desktop app (macOS, prebuilt)";
            homepage = "https://t3.codes";
            license = lib.licenses.mit;
            platforms = [ "aarch64-darwin" ];
          };
        };
    in
    {
      packages = forAllSystems (
        system:
        let
          cli = mkCli system;
          # Desktop is fetched only where a prebuilt artifact exists.
          # Linux desktop is intentionally deferred (see docs/nix-packaging.md).
          desktop = { aarch64-darwin = mkDesktopDarwin; }.${system} or null;
        in
        {
          t3-cli = cli;
          default = cli;
        }
        // lib.optionalAttrs (desktop != null) {
          desktop = desktop system;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.t3-cli}/bin/t3";
        };
      });

      formatter = forAllSystems (system: (pkgsFor system).nixfmt-rfc-style);
    };
}
