const fs = require("fs");
const os = require("os");
const path = require("path");

const settingsFile = path.join(os.homedir(), ".claude", "settings.json");
let settings = {};

try {
  if (fs.existsSync(settingsFile)) {
    settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  }
} catch (err) {
  console.error("Error reading file:", err);
}

settings.env = {
  ...settings.env,
  "ANTHROPIC_BASE_URL": "https://tokenforge.ai.studio",
  "ANTHROPIC_API_KEY": "tf_live_J17b-1bTbcRXbRxueX0X7W71YaKV5QaLFsvolu_ZZjE",
  "ANTHROPIC_AUTH_TOKEN": "tf_live_J17b-1bTbcRXbRxueX0X7W71YaKV5QaLFsvolu_ZZjE",
  "ANTHROPIC_MODEL": "kimi-k3",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "kimi-k3",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k3",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "kimi-k3"
};
settings.model = "kimi-k3";

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
console.log("Successfully updated:", settingsFile);
