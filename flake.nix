{
  description = "T3 Code — prebuilt CLI + desktop app";

  # Releases are automated: push a tag (e.g. `git tag v0.0.24-fork.3 && git push
  # origin v0.0.24-fork.3`) and `.github/workflows/nix-release.yml` builds the
  # artifacts, computes their hashes, and commits the updated `nix-hashes.json`
  # back to `personal`. Do not edit `nix-hashes.json` by hand.
  # See docs/ci-auto-hash-plan.md.

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

    # Version + artifact hashes are written by CI on tag push (see header comment).
    release = builtins.fromJSON (builtins.readFile ./nix-hashes.json);
    version = release.version;
    releaseTag = "v${version}";

    artifactUrl = name: "https://github.com/${owner}/${repo}/releases/download/${releaseTag}/${name}";

    hashes = {inherit (release) cli desktop;};

    systems = [
      "x86_64-linux"
      "aarch64-darwin"
    ];

    forAllSystems = lib.genAttrs systems;
    pkgsFor = system: import nixpkgs {inherit system;};

    mkCli = system: let
      pkgs = pkgsFor system;
      nodejs = pkgs.nodejs_24;
    in
      pkgs.stdenvNoCC.mkDerivation {
        pname = "t3code-cli";
        inherit version;

        src = pkgs.fetchurl {
          url = artifactUrl "t3code-cli-${system}.tar.gz";
          hash = hashes.cli.${system};
        };

        nativeBuildInputs = [pkgs.makeWrapper];
        sourceRoot = ".";

        installPhase = ''
          runHook preInstall
          mkdir -p $out/libexec/t3code
          # The release tarball is a pruned `pnpm deploy --prod` tree: the bundled
          # CLI output (dist/bin.mjs) plus only the runtime dependency closure,
          # with node_modules/, dist/, and package.json at the tarball root.
          cp -R node_modules dist package.json $out/libexec/t3code/
          # Drop the workspace self-reference symlink (and any other dangling
          # links); the prod runtime symlinks into .pnpm are relative and survive.
          find $out/libexec/t3code -xtype l -delete 2>/dev/null || true

          makeWrapper ${nodejs}/bin/node $out/bin/t3 \
            --add-flags "$out/libexec/t3code/dist/bin.mjs" \
            --prefix PATH : ${lib.makeBinPath [nodejs]}
          runHook postInstall
        '';

        meta = {
          description = "T3 Code CLI";
          homepage = "https://t3.codes";
          license = lib.licenses.mit;
          mainProgram = "t3";
          platforms = [system];
        };
      };

    mkDesktopDarwin = system: let
      pkgs = pkgsFor system;
    in
      pkgs.stdenvNoCC.mkDerivation {
        pname = "t3code-desktop";
        inherit version;

        src = pkgs.fetchurl {
          url = artifactUrl "T3-Code-${version}-arm64.zip";
          hash = hashes.desktop.${system};
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

    devShells = forAllSystems (system: let
      pkgs = pkgsFor system;
    in {
      default = pkgs.mkShell {
        packages = with pkgs; [bun nodejs turbo];
      };
    });

    formatter = forAllSystems (system: (pkgsFor system).nixfmt-rfc-style);
  };
}
