{
  description = "T3 Code — CLI built from source + prebuilt desktop app";

  # Hybrid flake: `t3-cli` is built from source; `desktop` is a fetched prebuilt
  # artifact. Design, maintenance steps, and gotchas live in docs/nix-packaging.md.

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    lib = nixpkgs.lib;

    owner = "kevinher7";
    repo = "t3code";
    version = "0.0.24-fork.1";
    releaseTag = "v${version}";

    desktopArtifactUrl = arch: ext: "https://github.com/${owner}/${repo}/releases/download/${releaseTag}/T3-Code-${version}-${arch}.${ext}";

    # Capture each by building with lib.fakeHash (see docs/nix-packaging.md).
    desktopHashes = {
      aarch64-darwin = "sha256-sgWeYe9Rc3KKPkqb+l4eFeT3QHRrsy7HC0UukJe8KQM=";
    };

    bunDepsHashes = {
      x86_64-linux = lib.fakeHash;
      aarch64-darwin = "sha256-OWHMBirGRbmEO6ASo06jm0Fn1m4yTkKItHaEnUhoSSw=";
    };

    systems = [
      "x86_64-linux"
      "aarch64-darwin"
    ];

    forAllSystems = lib.genAttrs systems;
    pkgsFor = system:
      import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

    mkCli = system: let
      pkgs = pkgsFor system;
      nodejs = pkgs.nodejs_24;

      # Fixed-output derivation: bun install with network access; output is
      # hashed, so it is system-specific (native addons differ).
      nodeModules = pkgs.stdenv.mkDerivation {
        pname = "t3code-node-modules";
        inherit version;
        src = self;

        nativeBuildInputs = [
          pkgs.bun
          nodejs
          pkgs.python3
          pkgs.pkg-config
          pkgs.cacert
        ];

        dontConfigure = true;
        dontFixup = true;

        buildPhase = ''
          runHook preBuild
          export HOME=$TMPDIR
          export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache
          export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export NODE_EXTRA_CA_CERTS=$SSL_CERT_FILE
          export ELECTRON_SKIP_BINARY_DOWNLOAD=1
          # node-gyp (node-pty) must use the nixpkgs node headers instead of
          # downloading them, and be told which python to use.
          export npm_config_nodedir=${nodejs}
          export npm_config_python=${pkgs.python3}/bin/python3
          bun install --frozen-lockfile --no-progress
          runHook postBuild
        '';

        # Capture every workspace node_modules (bun isolated linker).
        installPhase = ''
          runHook preInstall
          mkdir -p $out
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
      pkgs.stdenv.mkDerivation {
        pname = "t3code-cli";
        inherit version;
        src = self;

        nativeBuildInputs = [
          nodejs
          pkgs.bun
          pkgs.makeWrapper
        ];

        dontConfigure = true;

        # Restore the workspace node_modules layout, then build offline.
        buildPhase = ''
          runHook preBuild
          export HOME=$TMPDIR
          export TURBO_TELEMETRY_DISABLED=1
          export DO_NOT_TRACK=1

          for d in $(cd ${nodeModules} && find . -type d -name node_modules -prune); do
            mkdir -p "$(dirname "$d")"
            cp -R "${nodeModules}/$d" "$d"
            chmod -R u+w "$d"
          done

          ./node_modules/.bin/turbo run build --filter=t3 --no-daemon
          runHook postBuild
        '';

        # Reproduce the apps/server/dist -> node_modules layout so bin.mjs
        # resolves its (external) npm deps at runtime, then drop dangling
        # @t3tools/* symlinks (inlined into bin.mjs by tsdown).
        installPhase = ''
          runHook preInstall
          mkdir -p $out/libexec/t3code/apps/server

          cp -R node_modules $out/libexec/t3code/node_modules
          cp -R apps/server/dist $out/libexec/t3code/apps/server/dist
          cp -R apps/server/node_modules $out/libexec/t3code/apps/server/node_modules
          find $out/libexec/t3code -xtype l -delete

          makeWrapper ${nodejs}/bin/node $out/bin/t3 \
            --add-flags "$out/libexec/t3code/apps/server/dist/bin.mjs" \
            --prefix PATH : ${lib.makeBinPath [nodejs]}
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

    # macOS: unpack the prebuilt .zip and expose the .app for nix-darwin.
    mkDesktopDarwin = system: let
      pkgs = pkgsFor system;
    in
      pkgs.stdenv.mkDerivation {
        pname = "t3code-desktop";
        inherit version;

        src = pkgs.fetchurl {
          url = desktopArtifactUrl "arm64" "zip";
          hash = desktopHashes.${system};
        };

        nativeBuildInputs = [pkgs.unzip];

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
          platforms = ["aarch64-darwin"];
        };
      };
  in {
    packages = forAllSystems (
      system: let
        cli = mkCli system;
        # Linux desktop intentionally deferred (see docs/nix-packaging.md).
        desktop = {aarch64-darwin = mkDesktopDarwin;}.${system} or null;
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
