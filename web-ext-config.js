const { readFileSync } = require("fs");

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
