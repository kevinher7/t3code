{
  description = "T3 Code — prebuilt CLI + desktop app";

  # To update after a new release:
  #   1. Set version to the new tag (without v prefix)
  #   2. Build — hash mismatches show the correct values
  #   3. Update hashes, commit, push

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
    version = "0.0.24-fork.2";
    releaseTag = "v${version}";

    artifactUrl = name: "https://github.com/${owner}/${repo}/releases/download/${releaseTag}/${name}";

    hashes = {
      cli = {
        x86_64-linux = "sha256-MKkdYGEMLT4LGp9seI5cQdCCpMONC5S52aCR7oKJowM=";
        aarch64-darwin = "sha256-QzDqz5wD/tmljzrY3qZhGLfN1lbx6kBNbn9lDioNOMM=";
      };
      desktop = {
        aarch64-darwin = "sha256-XyAzA+xKpElXW6s4BuSZUMvRcEqmhUs8bAYu92gKyVI=";
      };
    };

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
          cp -R node_modules apps $out/libexec/t3code/
          find $out/libexec/t3code -xtype l -delete 2>/dev/null || true

          makeWrapper ${nodejs}/bin/node $out/bin/t3 \
            --add-flags "$out/libexec/t3code/apps/server/dist/bin.mjs" \
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
