const { existsSync, readFileSync } = require("fs");

// Lokalt leses nøklene fra .env. I CI settes WEB_EXT_API_KEY og WEB_EXT_API_SECRET direkte.
if (!existsSync(".env")) {
  module.exports = {};
} else {
  const env = Object.fromEntries(
    readFileSync(".env", "utf-8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => line.split("=", 2)),
  );

  module.exports = {
    sign: {
      apiKey: env.MOZ_API_KEY,
      apiSecret: env.MOZ_API_SECRET,
    },
  };
}
