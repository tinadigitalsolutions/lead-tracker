const fs = require("fs");
const path = require("path");

module.exports = async function createLauncher(context) {
  const { outDir, packager, platformToTargets } = context;

  if (!platformToTargets || !platformToTargets.has("darwin")) return;

  const appName = packager.appInfo.productFilename;
  const launcherPath = path.join(outDir, `${appName}.command`);

  const launcher = `#!/bin/bash\nset -e\nDIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nopen \"$DIR/${appName}.app\"\n`;

  fs.writeFileSync(launcherPath, launcher, { mode: 0o755 });
};
