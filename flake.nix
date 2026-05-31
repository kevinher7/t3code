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
        aarch64-darwin = lib.fakeHash;
      };

      # CLI builds on these; desktop is fetched only where an artifact exists.
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];

      forAllSystems = lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; config.allowUnfree = true; };

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
            ];

            dontConfigure = true;
            dontFixup = true;

            buildPhase = ''
              runHook preBuild
              export HOME=$TMPDIR
              export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache
              bun install --frozen-lockfile --no-progress
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -R node_modules $out/node_modules
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
            pkgs.makeWrapper
          ];

          dontConfigure = true;

          buildPhase = ''
            runHook preBuild
            export HOME=$TMPDIR
            export TURBO_TELEMETRY_DISABLED=1
            export DO_NOT_TRACK=1

            # Bring in the pre-resolved dependency tree (writable copy).
            cp -R ${nodeModules}/node_modules ./node_modules
            chmod -R u+w ./node_modules

            # `t3` depends on @t3tools/web, so this also runs the web build first,
            # then apps/server's `node scripts/cli.ts build` (tsdown + copy client).
            ./node_modules/.bin/turbo run build --filter=t3 --no-daemon
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/libexec/t3code

            # tsdown leaves all npm deps external, so the runtime needs the full
            # dependency tree next to dist/ (node-pty's native addon included).
            cp -R apps/server/dist $out/libexec/t3code/dist
            cp -R node_modules $out/libexec/t3code/node_modules

            makeWrapper ${nodejs}/bin/node $out/bin/t3 \
              --add-flags "$out/libexec/t3code/dist/bin.mjs" \
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
