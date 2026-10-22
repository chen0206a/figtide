// Exercises actual process restart via scripts/test-agent.ps1, against the isolated database only.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const base = "http://127.0.0.1:8087/api";
const root = path.resolve(__dirname, "../../..");
const marker = path.join(root, ".runtime/audit-restart.json");
async function api(url, data, method = "POST") {
  const response = await fetch(
    base + url,
    data === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  assert(response.ok, `${url}: HTTP ${response.status}`);
  return response.json();
}
(async () => {
  if (process.argv[2] === "prepare") {
    assert.equal((await api("/agent/provider")).model, "labflow-fixture");
    const projects = await api("/projects");
    const watermark = Math.max(...projects.map((p) => p.id));
    assert(watermark >= 1);
    const project = await api("/projects", {
      name: "Audit restart fixture",
      description: "Synthetic test only",
    });
    const form = new FormData();
    form.append(
      "file",
      new Blob(["epoch,accuracy,error\n1,0.7,0.01\n2,0.8,0.02"], {
        type: "text/csv",
      }),
      "synthetic.csv",
    );
    const response = await fetch(base + `/projects/${project.id}/datasets`, {
      method: "POST",
      body: form,
    });
    assert(response.ok);
    const dataset = await response.json();
    const config = JSON.parse(
      fs.readFileSync(
        path.join(root, "backend/src/test/resources/config-v1.json"),
        "utf8",
      ),
    );
    config.datasetVersionId = dataset.id;
    const envelope = {
      protocol_version: 1,
      chart_id: null,
      base_revision: 0,
      config,
      share_metadata: true,
      prompt: "调整图例和字号",
    };
    const initial = await api(`/projects/${project.id}/agent/runs`, envelope);
    let completed;
    for (let n = 0; n < 100; n++) {
      completed = await api(
        `/projects/${project.id}/agent/runs/${initial.run_id}`,
      );
      if (completed.status === "proposed") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(completed.status, "proposed");
    await api(`/projects/${project.id}/agent/runs/${initial.run_id}/decision`, {
      outcome: "rejected",
      reason: "重启验证",
      proposal_hash: completed.proposal_hash,
    });
    const audit = await api(
      `/projects/${project.id}/agent/runs/${initial.run_id}/audit`,
    );
    const pending = await api(`/projects/${project.id}/agent/runs`, {
      ...envelope,
      prompt: "慢速重启验证",
    });
    fs.writeFileSync(
      marker,
      JSON.stringify({
        project: project.id,
        watermark,
        audit,
        pending: pending.run_id,
        pending_session: pending.session_id,
        pending_reservation: pending.max_tokens,
      }),
    );
    console.log(
      "[audit-restart] Prepared terminal audit and an in-flight run.",
    );
  } else {
    const saved = JSON.parse(fs.readFileSync(marker, "utf8"));
    const audit = await api(
      `/projects/${saved.project}/agent/runs/${saved.audit.run_id}/audit`,
    );
    assert.deepEqual(audit, saved.audit);
    const recovered = await api(
      `/projects/${saved.project}/agent/runs/${saved.pending}`,
    );
    assert.equal(recovered.outcome, "interrupted");
    assert.equal(recovered.usage_complete, false);
    const sessionRecovery = await api(
      `/projects/${saved.project}/agent/runs/${saved.pending}/resume`,
    );
    assert.equal(sessionRecovery.session.session_id, saved.pending_session);
    assert.equal(sessionRecovery.session.reserved_budget, 0);
    assert.equal(
      sessionRecovery.session.used_budget,
      saved.pending_reservation,
    );
    assert.equal(sessionRecovery.session.uncertain_runs, 1);
    assert.equal(sessionRecovery.candidate, undefined);
    assert.equal(sessionRecovery.baseline, undefined);

    assert.equal(recovered.proposal, undefined);
    const response = await fetch(
      base + `/test/projects?after=${saved.watermark}`,
      { method: "DELETE", headers: { "X-LabFlow-Test-Run": "1" } },
    );
    assert(response.ok);
    fs.unlinkSync(marker);
    console.log(
      "[audit-restart] Completed audit survived a new JVM unchanged; interrupted run recovered; fixture cleaned.",
    );
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
