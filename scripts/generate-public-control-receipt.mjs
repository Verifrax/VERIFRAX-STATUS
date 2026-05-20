import fs from "node:fs/promises";

const generated_at = new Date().toISOString();

const probes = [
  {
    id: "status_perimeter_json",
    url: "https://status.verifrax.net/perimeter/status.json",
    required: ["PUBLIC_PERIMETER_GREEN", "SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX"],
    json: true
  },
  {
    id: "status_perimeter_page",
    url: "https://status.verifrax.net/perimeter/",
    required: ["PUBLIC_PERIMETER_GREEN", "SYSTEM_CONTROL_MAP_OPEN"]
  },
  {
    id: "status_system_json",
    url: "https://status.verifrax.net/system-control.json",
    required: ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX"]
  },
  {
    id: "status_system_page",
    url: "https://status.verifrax.net/system/",
    required: ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX system", "not complete"]
  },
  {
    id: "root_system_json",
    url: "https://www.verifrax.net/system-control.json",
    required: ["SYSTEM_CONTROL_MAP_OPEN", "PUBLIC_PERIMETER_GREEN", "status.verifrax.net/perimeter/status.json"]
  },
  {
    id: "root_system_page",
    url: "https://www.verifrax.net/system/",
    required: ["SYSTEM_CONTROL_MAP_OPEN", "PUBLIC_PERIMETER_GREEN", "status.verifrax.net/perimeter/status.json"]
  },
  {
    id: "apply_intake",
    url: "https://apply.verifrax.net/",
    required: ["Terminal intake control plane", "does not publish proof", "recognize terminal truth", "assign recourse"]
  },
  {
    id: "public_root",
    url: "https://www.verifrax.net/",
    required: ["VERIFRAX"]
  },
  {
    id: "public_status",
    url: "https://status.verifrax.net/",
    required: ["VERIFRAX Status"]
  }
];

async function fetchProbe(probe) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${probe.url}${probe.url.includes("?") ? "&" : "?"}receipt_probe=${Date.now()}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "user-agent": "VERIFRAX public control receipt"
      }
    });

    const body = await response.text();
    const missing = probe.required.filter(token => !body.includes(token));

    let parsed = null;
    let semantic_errors = [];

    if (probe.json) {
      try {
        parsed = JSON.parse(body);
        if (probe.id === "status_perimeter_json") {
          if (parsed.system !== "VERIFRAX") semantic_errors.push("wrong_system");
          if (parsed.state !== "PUBLIC_PERIMETER_GREEN") semantic_errors.push("perimeter_not_green");
          if (parsed.control_state !== "SYSTEM_CONTROL_MAP_OPEN") semantic_errors.push("wrong_control_state");
          if (parsed.system_complete !== false) semantic_errors.push("system_complete_must_be_false");
          if (parsed.summary?.failed !== 0) semantic_errors.push("failed_perimeter_hosts");
        }
      } catch {
        semantic_errors.push("invalid_json");
      }
    }

    return {
      ...probe,
      ok: response.status >= 200 && response.status < 400 && missing.length === 0 && semantic_errors.length === 0,
      http_status: response.status,
      elapsed_ms: Date.now() - started,
      missing_required_tokens: missing,
      semantic_errors,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      ...probe,
      ok: false,
      http_status: 0,
      elapsed_ms: Date.now() - started,
      missing_required_tokens: probe.required,
      semantic_errors: [String(error?.message || error)],
      checked_at: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = [];
for (const probe of probes) checks.push(await fetchProbe(probe));

const failed = checks.filter(c => !c.ok);

const receipt = {
  schema_version: "1.0.0",
  receipt_type: "VERIFRAX_PUBLIC_CONTROL_RECEIPT",
  generated_at,
  state: failed.length === 0 ? "VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN" : "VERIFRAX_PUBLIC_CONTROL_RECEIPT_DEGRADED",
  system: "VERIFRAX",
  system_complete: false,
  control_state: "SYSTEM_CONTROL_MAP_OPEN",
  perimeter_state: "PUBLIC_PERIMETER_GREEN",
  scheduled_monitor: true,
  root_points_to_perimeter_status: true,
  completion_warning: "This receipt proves live public control posture only. It is not VERIFRAX_SYSTEM_COMPLETE.",
  checks,
  summary: {
    total: checks.length,
    green: checks.filter(c => c.ok).length,
    failed: failed.length
  }
};

await fs.mkdir("control-receipt", { recursive: true });
await fs.mkdir("public/control-receipt", { recursive: true });

await fs.writeFile("control-receipt/receipt.json", JSON.stringify(receipt, null, 2) + "\n");
await fs.writeFile("public/control-receipt/receipt.json", JSON.stringify(receipt, null, 2) + "\n");

const rows = checks.map(c => `
<tr>
  <td><code>${c.id}</code></td>
  <td>${c.ok ? "GREEN" : "FAIL"}</td>
  <td>${c.http_status}</td>
  <td><a href="${c.url}">${c.url}</a></td>
  <td>${c.missing_required_tokens.concat(c.semantic_errors).join(", ") || "—"}</td>
</tr>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VERIFRAX Public Control Receipt</title>
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
  <div class="muted">VERIFRAX / public-control-receipt</div>
  <h1>Public control receipt.</h1>
  <p class="muted">Generated from live public endpoints. This is not a system-completion claim.</p>

  <section class="panel">
    <h2>${receipt.state}</h2>
    <p>Generated: <code>${receipt.generated_at}</code></p>
    <p>Control state: <code>${receipt.control_state}</code></p>
    <p>Perimeter state: <code>${receipt.perimeter_state}</code></p>
    <p>System complete: <code>false</code></p>
    <p>Machine receipt: <a href="/control-receipt/receipt.json">/control-receipt/receipt.json</a></p>
  </section>

  <section class="panel">
    <h2>Checks</h2>
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>HTTP</th><th>URL</th><th>Failure</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
</main>
</body>
</html>
`;

await fs.writeFile("control-receipt/index.html", html);
await fs.writeFile("public/control-receipt/index.html", html);

if (failed.length) {
  console.error(JSON.stringify(receipt, null, 2));
  process.exit(1);
}

console.log("VERIFRAX_PUBLIC_CONTROL_RECEIPT_GREEN=true");
console.log(JSON.stringify(receipt.summary));
