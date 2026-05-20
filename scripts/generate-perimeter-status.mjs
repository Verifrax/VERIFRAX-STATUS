import fs from "node:fs/promises";

const now = new Date().toISOString();

const hosts = [
  {
    id: "root",
    role: "root-router",
    url: "https://www.verifrax.net/",
    required: ["VERIFRAX"]
  },
  {
    id: "root-system",
    role: "root-system-control",
    url: "https://www.verifrax.net/system-control.json",
    required: ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX"]
  },
  {
    id: "docs",
    role: "docs",
    url: "https://docs.verifrax.net/",
    required: ["VERIFRAX"]
  },
  {
    id: "proof",
    role: "proof-publication",
    url: "https://proof.verifrax.net/",
    required: ["VERIFRAX"]
  },
  {
    id: "verify",
    role: "public-verification",
    url: "https://verify.verifrax.net/",
    required: ["VERIFRAX"]
  },
  {
    id: "authority",
    role: "authority",
    url: "https://auctoriseal.verifrax.net/",
    required: ["AUCTORISEAL"]
  },
  {
    id: "runtime",
    role: "runtime",
    url: "https://corpiform.verifrax.net/",
    required: ["CORPIFORM"]
  },
  {
    id: "execution-api",
    role: "execution-api",
    url: "https://api.verifrax.net/",
    required: ["VERIFRAX"]
  },
  {
    id: "archive",
    role: "archive-reference",
    url: "https://sigillarium.verifrax.net/",
    required: ["SIGILLARIUM"]
  },
  {
    id: "apply",
    role: "intake",
    url: "https://apply.verifrax.net/",
    required: ["Terminal intake control plane", "does not publish proof", "recognize terminal truth", "assign recourse"]
  },
  {
    id: "status",
    role: "global-status-board",
    url: "https://status.verifrax.net/",
    required: ["VERIFRAX Status"]
  },
  {
    id: "status-system",
    role: "status-system-control",
    url: "https://status.verifrax.net/system-control.json",
    required: ["SYSTEM_CONTROL_MAP_OPEN", "VERIFRAX"]
  }
];

async function checkHost(host) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${host.url}${host.url.includes("?") ? "&" : "?"}probe=${Date.now()}`, {
      signal: controller.signal,
      headers: {
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "user-agent": "VERIFRAX-STATUS perimeter monitor"
      },
      redirect: "follow"
    });

    const body = await response.text();
    const elapsed_ms = Date.now() - started;
    const missing = host.required.filter(token => !body.includes(token));

    return {
      ...host,
      ok: response.status >= 200 && response.status < 400 && missing.length === 0,
      http_status: response.status,
      elapsed_ms,
      missing_required_tokens: missing,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      ...host,
      ok: false,
      http_status: 0,
      elapsed_ms: Date.now() - started,
      missing_required_tokens: host.required,
      error: String(error && error.message || error),
      checked_at: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = [];
for (const host of hosts) checks.push(await checkHost(host));

const failed = checks.filter(x => !x.ok);

const perimeter = {
  schema_version: "1.0.0",
  generated_at: now,
  system: "VERIFRAX",
  state: failed.length === 0 ? "PUBLIC_PERIMETER_GREEN" : "PUBLIC_PERIMETER_DEGRADED",
  system_complete: false,
  control_state: "SYSTEM_CONTROL_MAP_OPEN",
  completion_warning: "PUBLIC_PERIMETER_GREEN is not VERIFRAX_SYSTEM_COMPLETE",
  hosts: checks,
  summary: {
    total: checks.length,
    green: checks.filter(x => x.ok).length,
    failed: failed.length
  }
};

await fs.mkdir("perimeter", { recursive: true });
await fs.mkdir("public/perimeter", { recursive: true });

await fs.writeFile("perimeter/status.json", JSON.stringify(perimeter, null, 2) + "\n");
await fs.writeFile("public/perimeter/status.json", JSON.stringify(perimeter, null, 2) + "\n");

const htmlRows = checks.map(h => `
<tr>
  <td><code>${h.id}</code></td>
  <td>${h.ok ? "GREEN" : "FAIL"}</td>
  <td>${h.http_status}</td>
  <td>${h.role}</td>
  <td><a href="${h.url}">${h.url}</a></td>
  <td>${h.missing_required_tokens.join(", ") || "—"}</td>
</tr>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VERIFRAX Public Perimeter Status</title>
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
  <div class="muted">VERIFRAX / public-perimeter</div>
  <h1>Live perimeter status.</h1>
  <p class="muted">Generated by CI from live hosts. This is not a system-completion claim.</p>
  <section class="panel">
    <h2>${perimeter.state}</h2>
    <p>Generated: <code>${perimeter.generated_at}</code></p>
    <p>Green: <code>${perimeter.summary.green}/${perimeter.summary.total}</code></p>
    <p>System complete: <code>false</code></p>
    <p>Control state: <code>SYSTEM_CONTROL_MAP_OPEN</code></p>
    <p>Machine JSON: <a href="/perimeter/status.json">/perimeter/status.json</a></p>
  </section>
  <section class="panel">
    <h2>Host probes</h2>
    <table>
      <thead><tr><th>Host</th><th>Status</th><th>HTTP</th><th>Role</th><th>URL</th><th>Missing required tokens</th></tr></thead>
      <tbody>${htmlRows}</tbody>
    </table>
  </section>
</main>
</body>
</html>
`;

await fs.writeFile("perimeter/index.html", html);
await fs.writeFile("public/perimeter/index.html", html);

if (failed.length) {
  console.error(JSON.stringify(perimeter, null, 2));
  process.exit(1);
}

console.log("VERIFRAX_PUBLIC_PERIMETER_GREEN=true");
console.log(JSON.stringify(perimeter.summary));
