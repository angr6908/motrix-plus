import fs from "node:fs";

const version = (process.env.RELEASE_TAG ?? "").replace(/^v/, "");
const { EXTRA_PLATFORM: platform, EXTRA_ARCH: arch } = process.env;

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Release tag must be vX.Y.Z or vX.Y.Z-prerelease");
}

if (!platform || !arch) {
  throw new Error("EXTRA_PLATFORM and EXTRA_ARCH are required");
}

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

for (const path of ["package.json", "src-tauri/tauri.conf.json"]) {
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  data.version = version;
  writeJson(path, data);
}

const cargoPath = "src-tauri/Cargo.toml";
const cargoToml = fs.readFileSync(cargoPath, "utf8");
const nextCargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`);
if (nextCargoToml === cargoToml) {
  throw new Error("No Cargo package version found");
}
fs.writeFileSync(cargoPath, nextCargoToml);

writeJson("src-tauri/tauri.release.conf.json", {
  version,
  bundle: {
    resources: [`extra/${platform}/${arch}/**/*`],
    macOS: {
      signingIdentity: "-",
    },
  },
});
