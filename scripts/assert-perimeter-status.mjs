import fs from "node:fs";

const status = JSON.parse(fs.readFileSync("perimeter/status.json", "utf8"));

const requiredHosts = [
  "root",
  "root-system",
  "docs",
  "proof",
  "verify",
  "authority",
  "runtime",
  "execution-api",
  "archive",
  "apply",
  "status",
  "status-system"
];

if (status.system !== "VERIFRAX") throw new Error("wrong system");
if (status.state !== "PUBLIC_PERIMETER_GREEN") throw new Error(`bad state: ${status.state}`);
if (status.control_state !== "SYSTEM_CONTROL_MAP_OPEN") throw new Error(`bad control state: ${status.control_state}`);
if (status.system_complete !== false) throw new Error("system_complete must remain false");
if (status.summary.failed !== 0) throw new Error(`failed probes: ${status.summary.failed}`);

const ids = new Set(status.hosts.map(h => h.id));
for (const id of requiredHosts) {
  if (!ids.has(id)) throw new Error(`missing host probe: ${id}`);
}

for (const host of status.hosts) {
  if (!host.ok) throw new Error(`host not ok: ${host.id}`);
  if (host.http_status < 200 || host.http_status >= 400) {
    throw new Error(`bad http status for ${host.id}: ${host.http_status}`);
  }
  if (host.missing_required_tokens.length) {
    throw new Error(`missing required tokens for ${host.id}: ${host.missing_required_tokens.join(",")}`);
  }
}

console.log("VERIFRAX_PERIMETER_STATUS_ASSERT_OK=true");
