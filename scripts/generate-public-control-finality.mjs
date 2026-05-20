import fs from "node:fs/promises";
import crypto from "node:crypto";

const generated_at = new Date().toISOString();

const targets = [
  ["replay", "https://status.verifrax.net/control-receipt/replay.json", ["VERIFRAX_PUBLIC_CONTROL_REPLAY_GREEN", "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN", "PUBLIC_PERIMETER_GREEN", "SYSTEM_CONTROL_MAP_OPEN"]],
  ["receipt", "https://status.verifrax.net/control-receipt/receipt.json", ["VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN", "PUBLIC_PERIMETER_GREEN", "SYSTEM_CONTROL_MAP_OPEN"]],
  ["perimeter", "https://status.verifrax.net/perimeter/status.json", ["PUBLIC_PERIMETER_GREEN", "SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX"]],
  ["root_control", "https://www.verifrax.net/system-control.json", ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX_PUBLIC_CONTROL_REPLAY_GREEN", "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN", "PUBLIC_PERIMETER_GREEN", "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN", "status.verifrax.net/control-receipt/finality.json"]],
  ["root_data_control", "https://www.verifrax.net/data/verifrax-system-control.json", ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN", "status.verifrax.net/control-receipt/finality.json"]],
  ["root_page", "https://www.verifrax.net/system/", ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN", "status.verifrax.net/control-receipt/finality"]],
  ["status_control", "https://status.verifrax.net/system-control.json", ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX"]],
  ["apply", "https://apply.verifrax.net/", ["Terminal intake control plane", "does not publish proof", "recognize terminal truth", "assign recourse"]]
];

async function probe([id, url, required]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const started = Date.now();

  try {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}fixed_point=${Date.now()}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "user-agent": "VERIFRAX public control fixed point"
      }
    });

    const body = await response.text();
    const missing = required.filter(t => !body.includes(t));
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");

    let parsed = null;
    let semantic_errors = [];
    if (url.endsWith(".json")) {
      try { parsed = JSON.parse(body); } catch { semantic_errors.push("invalid_json"); }
    }

    return {
      id,
      url,
      ok: response.status >= 200 && response.status < 400 && missing.length === 0 && semantic_errors.length === 0,
      http_status: response.status,
      elapsed_ms: Date.now() - started,
      body_sha256: sha256,
      missing_required_tokens: missing,
      semantic_errors,
      parsed
    };
  } catch (e) {
    return {
      id,
      url,
      ok: false,
      http_status: 0,
      elapsed_ms: Date.now() - started,
      body_sha256: null,
      missing_required_tokens: required,
      semantic_errors: [String(e?.message || e)],
      parsed: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = [];
for (const target of targets) checks.push(await probe(target));

const byId = Object.fromEntries(checks.map(c => [c.id, c]));
const failures = [];

for (const c of checks) {
  if (!c.ok) failures.push(`${c.id}:probe_failure`);
}

const replay = byId.replay.parsed;
const receipt = byId.receipt.parsed;
const perimeter = byId.perimeter.parsed;
const root = byId.root_control.parsed;
const rootData = byId.root_data_control.parsed;
const statusControl = byId.status_control.parsed;

if (replay?.state !== "VERIFRAX_PUBLIC_CONTROL_REPLAY_GREEN") failures.push("replay_not_green");
if (replay?.summary?.cross_failures !== 0) failures.push("replay_cross_failures");
if (replay?.system_complete !== false) failures.push("replay_completion_not_false");

if (receipt?.state !== "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN") failures.push("receipt_not_green");
if (receipt?.system_complete !== false) failures.push("receipt_completion_not_false");

if (perimeter?.state !== "PUBLIC_PERIMETER_GREEN") failures.push("perimeter_not_green");
if (perimeter?.summary?.failed !== 0) failures.push("perimeter_failed_hosts");
if (perimeter?.system_complete !== false) failures.push("perimeter_completion_not_false");

if (root?.public_control_fixed_point !== "https://status.verifrax.net/control-receipt/finality.json") failures.push("root_fixed_point_url_bad");
if (root?.public_control_fixed_point_state !== "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN") failures.push("root_fixed_point_state_bad");
if (root?.system_complete !== false) failures.push("root_completion_not_false");

if (rootData?.public_control_fixed_point !== "https://status.verifrax.net/control-receipt/finality.json") failures.push("root_data_fixed_point_url_bad");
if (rootData?.public_control_fixed_point_state !== "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN") failures.push("root_data_fixed_point_state_bad");
if (rootData?.system_complete !== false) failures.push("root_data_completion_not_false");

if (statusControl?.system_complete !== false) failures.push("status_completion_not_false");

const finality = {
  schema_version: "1.0.0",
  object_type: "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT",
  generated_at,
  state: failures.length === 0 ? "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN" : "VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_DEGRADED",
  system: "VERIFRAX",
  system_complete: false,
  control_state: "SYSTEM_CONTROL_MAP_OPEN",
  perimeter_state: "PUBLIC_PERIMETER_GREEN",
  receipt_state: "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
  replay_state: "VERIFRAX_PUBLIC_CONTROL_REPLAY_GREEN",
  root_points_to_fixed_point: root?.public_control_fixed_point === "https://status.verifrax.net/control-receipt/finality.json",
  root_data_points_to_fixed_point: rootData?.public_control_fixed_point === "https://status.verifrax.net/control-receipt/finality.json",
  bounded_meaning: [
    "This object is a public control fixed point.",
    "It proves live public control posture and replay consistency only.",
    "It does not define law.",
    "It does not accept canonical state.",
    "It does not issue authority.",
    "It does not execute governed actions.",
    "It does not verify terminal truth.",
    "It does not recognize terminal truth.",
    "It does not assign terminal recourse.",
    "It does not make VERIFRAX_SYSTEM_COMPLETE true."
  ],
  ci: {
    repository: process.env.GITHUB_REPOSITORY || null,
    sha: process.env.GITHUB_SHA || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null
  },
  checks: checks.map(({ parsed, ...rest }) => rest),
  cross_failures: failures,
  summary: {
    total: checks.length,
    green: checks.filter(c => c.ok).length,
    failed: checks.filter(c => !c.ok).length,
    cross_failures: failures.length
  }
};

await fs.mkdir("control-receipt", { recursive: true });
await fs.mkdir("public/control-receipt", { recursive: true });

await fs.writeFile("control-receipt/finality.json", JSON.stringify(finality, null, 2) + "\n");
await fs.writeFile("public/control-receipt/finality.json", JSON.stringify(finality, null, 2) + "\n");

const rows = finality.checks.map(c => `
<tr>
<td><code>${c.id}</code></td>
<td>${c.ok ? "GREEN" : "FAIL"}</td>
<td>${c.http_status}</td>
<td><a href="${c.url}">${c.url}</a></td>
<td><code>${c.body_sha256 || "none"}</code></td>
<td>${c.missing_required_tokens.concat(c.semantic_errors).join(", ") || "—"}</td>
</tr>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VERIFRAX Public Control Fixed Point</title>
<style>
body{margin:0;background:#0f1115;color:#f4f5f7;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}
main{max-width:1180px;margin:0 auto;padding:48px 20px 72px}
h1{font-size:clamp(38px,7vw,78px);line-height:.92;margin:0;letter-spacing:-.05em}
.panel{border:1px solid #303846;background:#171b22;border-radius:18px;padding:22px;margin-top:22px}
table{width:100%;border-collapse:collapse}td,th{border-top:1px solid #303846;text-align:left;padding:10px;vertical-align:top}
a{color:#8ab4ff}code{border:1px solid #303846;border-radius:8px;padding:2px 6px}.muted{color:#a4acb8}
</style>
</head>
<body>
<main>
<div class="muted">VERIFRAX / public-control-fixed-point</div>
<h1>Public control fixed point.</h1>
<p class="muted">Replay-verified public control posture. This is not system completion.</p>
<section class="panel">
<h2>${finality.state}</h2>
<p>Generated: <code>${finality.generated_at}</code></p>
<p>Control: <code>${finality.control_state}</code></p>
<p>Perimeter: <code>${finality.perimeter_state}</code></p>
<p>Receipt: <code>${finality.receipt_state}</code></p>
<p>Replay: <code>${finality.replay_state}</code></p>
<p>System complete: <code>false</code></p>
<p>Machine finality: <a href="/control-receipt/finality.json">/control-receipt/finality.json</a></p>
</section>
<section class="panel">
<h2>Fixed-point checks</h2>
<table>
<thead><tr><th>Check</th><th>Status</th><th>HTTP</th><th>URL</th><th>SHA-256</th><th>Failure</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>
</main>
</body>
</html>`;

await fs.writeFile("control-receipt/finality.html", html);
await fs.writeFile("public/control-receipt/finality.html", html);

if (failures.length) {
  console.error(JSON.stringify(finality, null, 2));
  process.exit(1);
}

console.log("VERIFRAX_PUBLIC_CONTROL_FIXED_POINT_GREEN=true");
console.log(JSON.stringify(finality.summary));
