{
  description = "Project Island — a cute top-down pixel-art island RPG";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAll (pkgs: rec {
        # exactly what `npm run build` puts in dist/
        site = pkgs.buildNpmPackage {
          pname = "project-island";
          version = "0.0.0";
          src = pkgs.lib.cleanSourceWith {
            src = pkgs.lib.cleanSource ./.;
            filter =
              path: type:
              !builtins.elem (baseNameOf path) [
                "node_modules"
                "dist"
                "test-results"
                "playwright-report"
              ];
          };
          # reads package-lock.json directly, so there is no vendor hash to keep in sync
          npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;
          nodejs = pkgs.nodejs_22;
          # the e2e browsers can't be fetched in the build sandbox, and the build doesn't need them
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          installPhase = ''
            runHook preInstall
            cp -r dist $out
            runHook postInstall
          '';
        };

        # the game is html5, so running it means serving it and opening a browser
        default = pkgs.writeShellApplication {
          name = "project-island";
          runtimeInputs = [ pkgs.darkhttpd ];
          text = ''
            port="''${1:-8173}"
            url="http://127.0.0.1:$port/"
            echo "Project Island on $url — ctrl-c to stop"
            (
              sleep 1
              xdg-open "$url" || open "$url" || true
            ) >/dev/null 2>&1 &
            exec darkhttpd ${site} --addr 127.0.0.1 --port "$port"
          '';
        };
      });

      apps = forAll (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/bin/project-island";
        };
      });

      devShells = forAll (pkgs: {
        default = pkgs.mkShell { packages = [ pkgs.nodejs_22 ]; };
      });
    };
}
