import fs from "node:fs/promises";
import crypto from "node:crypto";

const now = new Date().toISOString();

const targets = [
  {
    id: "control_receipt",
    url: "https://status.verifrax.net/control-receipt/receipt.json",
    type: "json",
    required: [
      "VERIFRAX_PUBLIC_CONTROL_RECEIPT",
      "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
      "SYSTEM_CONTROL_MAP_OPEN",
      "PUBLIC_PERIMETER_GREEN"
    ]
  },
  {
    id: "control_receipt_page",
    url: "https://status.verifrax.net/control-receipt/",
    type: "html",
    required: [
      "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
      "Public control receipt"
    ]
  },
  {
    id: "perimeter_status",
    url: "https://status.verifrax.net/perimeter/status.json",
    type: "json",
    required: [
      "PUBLIC_PERIMETER_GREEN",
      "SYSTEM_CONTROL_MAP_OPEN",
      "VERIFRAX"
    ]
  },
  {
    id: "root_control",
    url: "https://www.verifrax.net/system-control.json",
    type: "json",
    required: [
      "SYSTEM_CONTROL_MAP_OPEN",
      "PUBLIC_PERIMETER_GREEN",
      "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
      "https://status.verifrax.net/control-receipt/receipt.json"
    ]
  },
  {
    id: "root_control_page",
    url: "https://www.verifrax.net/system/",
    type: "html",
    required: [
      "SYSTEM_CONTROL_MAP_OPEN",
      "PUBLIC_PERIMETER_GREEN",
      "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
      "status.verifrax.net/control-receipt/receipt.json"
    ]
  },
  {
    id: "status_control",
    url: "https://status.verifrax.net/system-control.json",
    type: "json",
    required: [
      "SYSTEM_CONTROL_MAP_OPEN",
      "VERIFRAX"
    ]
  },
  {
    id: "apply_intake_boundary",
    url: "https://apply.verifrax.net/",
    type: "html",
    required: [
      "Terminal intake control plane",
      "does not publish proof",
      "recognize terminal truth",
      "assign recourse"
    ]
  },
  {
    id: "docs",
    url: "https://docs.verifrax.net/",
    type: "html",
    required: ["VERIFRAX"]
  },
  {
    id: "proof",
    url: "https://proof.verifrax.net/",
    type: "html",
    required: ["VERIFRAX"]
  },
  {
    id: "verify",
    url: "https://verify.verifrax.net/",
    type: "html",
    required: ["VERIFRAX"]
  },
  {
    id: "authority",
    url: "https://auctoriseal.verifrax.net/",
    type: "html",
    required: ["AUCTORISEAL"]
  },
  {
    id: "runtime",
    url: "https://corpiform.verifrax.net/",
    type: "html",
    required: ["CORPIFORM"]
  },
  {
    id: "api",
    url: "https://api.verifrax.net/",
    type: "html",
    required: ["VERIFRAX"]
  },
  {
    id: "archive",
    url: "https://sigillarium.verifrax.net/",
    type: "html",
    required: ["SIGILLARIUM"]
  }
];

async function fetchTarget(target) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${target.url}${target.url.includes("?") ? "&" : "?"}replay=${Date.now()}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "user-agent": "VERIFRAX public control replay"
      }
    });

    const body = await response.text();
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    const missing = target.required.filter(token => !body.includes(token));
    const semantic_errors = [];

    let parsed = null;
    if (target.type === "json") {
      try {
        parsed = JSON.parse(body);
      } catch {
        semantic_errors.push("invalid_json");
      }
    }

    return {
      ...target,
      ok: response.status >= 200 && response.status < 400 && missing.length === 0 && semantic_errors.length === 0,
      http_status: response.status,
      elapsed_ms: Date.now() - started,
      body_sha256: sha256,
      missing_required_tokens: missing,
      semantic_errors,
      parsed,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      http_status: 0,
      elapsed_ms: Date.now() - started,
      body_sha256: null,
      missing_required_tokens: target.required,
      semantic_errors: [String(error?.message || error)],
      parsed: null,
      checked_at: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = [];
for (const target of targets) checks.push(await fetchTarget(target));

const byId = Object.fromEntries(checks.map(c => [c.id, c]));
const failures = [];

for (const c of checks) {
  if (!c.ok) failures.push(`${c.id}:fetch_or_token_failure`);
}

const receipt = byId.control_receipt.parsed;
const perimeter = byId.perimeter_status.parsed;
const root = byId.root_control.parsed;
const statusControl = byId.status_control.parsed;

if (receipt) {
  if (receipt.receipt_type !== "VERIFRAX_PUBLIC_CONTROL_RECEIPT") failures.push("receipt_type_bad");
  if (receipt.state !== "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN") failures.push("receipt_state_bad");
  if (receipt.system !== "VERIFRAX") failures.push("receipt_system_bad");
  if (receipt.system_complete !== false) failures.push("receipt_system_complete_must_be_false");
  if (receipt.control_state !== "SYSTEM_CONTROL_MAP_OPEN") failures.push("receipt_control_state_bad");
  if (receipt.perimeter_state !== "PUBLIC_PERIMETER_GREEN") failures.push("receipt_perimeter_state_bad");
  if (receipt.summary?.failed !== 0) failures.push("receipt_has_failed_checks");
}

if (perimeter) {
  if (perimeter.state !== "PUBLIC_PERIMETER_GREEN") failures.push("perimeter_state_bad");
  if (perimeter.control_state !== "SYSTEM_CONTROL_MAP_OPEN") failures.push("perimeter_control_state_bad");
  if (perimeter.system_complete !== false) failures.push("perimeter_system_complete_must_be_false");
  if (perimeter.summary?.failed !== 0) failures.push("perimeter_has_failed_hosts");
}

if (root) {
  if (root.state !== "SYSTEM_CONTROL_MAP_OPEN") failures.push("root_state_bad");
  if (root.system_complete !== false) failures.push("root_system_complete_must_be_false");
  if (root.public_perimeter_state !== "PUBLIC_PERIMETER_GREEN") failures.push("root_perimeter_pointer_bad");
  if (root.public_control_receipt_state !== "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN") failures.push("root_receipt_pointer_bad");
  if (root.public_control_receipt !== "https://status.verifrax.net/control-receipt/receipt.json") failures.push("root_receipt_url_bad");
}

if (statusControl) {
  if (statusControl.state !== "SYSTEM_CONTROL_MAP_OPEN") failures.push("status_control_state_bad");
  if (statusControl.system_complete !== false) failures.push("status_control_complete_must_be_false");
}

const replay = {
  schema_version: "1.0.0",
  replay_type: "VERIFRAX_PUBLIC_CONTROL_REPLAY",
  generated_at: now,
  system: "VERIFRAX",
  state: failures.length === 0 ? "VERIFRAX_PUBLIC_CONTROL_REPLAY_GREEN" : "VERIFRAX_PUBLIC_CONTROL_REPLAY_DEGRADED",
  system_complete: false,
  control_state: "SYSTEM_CONTROL_MAP_OPEN",
  perimeter_state: "PUBLIC_PERIMETER_GREEN",
  receipt_state: "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
  bounded_meaning: [
    "This replay proves public endpoint consistency at replay time.",
    "It does not define law.",
    "It does not accept state.",
    "It does not issue authority.",
    "It does not execute governed actions.",
    "It does not verify as final source.",
    "It does not recognize terminal truth.",
    "It does not assign recourse.",
    "It does not make VERIFRAX_SYSTEM_COMPLETE true."
  ],
  checks: checks.map(({ parsed, ...rest }) => rest),
  cross_checks: {
    failures,
    root_points_to_control_receipt: root?.public_control_receipt === "https://status.verifrax.net/control-receipt/receipt.json",
    root_points_to_perimeter: root?.public_perimeter_status === "https://status.verifrax.net/perimeter/status.json",
    receipt_green: receipt?.state === "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN",
    perimeter_green: perimeter?.state === "PUBLIC_PERIMETER_GREEN",
    completion_false_everywhere: receipt?.system_complete === false && perimeter?.system_complete === false && root?.system_complete === false && statusControl?.system_complete === false
  },
  summary: {
    total: checks.length,
    green: checks.filter(c => c.ok).length,
    failed: checks.filter(c => !c.ok).length,
    cross_failures: failures.length
  }
};

await fs.mkdir("control-receipt", { recursive: true });
await fs.mkdir("public/control-receipt", { recursive: true });

await fs.writeFile("control-receipt/replay.json", JSON.stringify(replay, null, 2) + "\n");
await fs.writeFile("public/control-receipt/replay.json", JSON.stringify(replay, null, 2) + "\n");

const rows = replay.checks.map(c => `
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
<title>VERIFRAX Public Control Replay</title>
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
  <div class="muted">VERIFRAX / public-control-replay</div>
  <h1>Public control replay.</h1>
  <p class="muted">Independent replay of the live public receipt, perimeter status, root control object, status control object, and host boundaries.</p>
  <section class="panel">
    <h2>${replay.state}</h2>
    <p>Generated: <code>${replay.generated_at}</code></p>
    <p>Control: <code>${replay.control_state}</code></p>
    <p>Perimeter: <code>${replay.perimeter_state}</code></p>
    <p>Receipt: <code>${replay.receipt_state}</code></p>
    <p>System complete: <code>false</code></p>
    <p>Machine replay: <a href="/control-receipt/replay.json">/control-receipt/replay.json</a></p>
  </section>
  <section class="panel">
    <h2>Replay checks</h2>
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>HTTP</th><th>URL</th><th>SHA-256</th><th>Failure</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
</main>
</body>
</html>
`;

await fs.writeFile("control-receipt/replay.html", html);
await fs.writeFile("public/control-receipt/replay.html", html);

if (failures.length) {
  console.error(JSON.stringify(replay, null, 2));
  process.exit(1);
}

console.log("VERIFRAX_PUBLIC_CONTROL_REPLAY_GREEN=true");
console.log(JSON.stringify(replay.summary));
