import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Loader2, PlugZap, Unplug } from "lucide-react";
import { api, send } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import "./model-connection.css";

type Connection = {
  revision: number;
  available: boolean;
  base_url: string;
  model: string;
  has_key: boolean;
  source: string;
  verified_at: string;
};
type Probe = {
  ok: boolean;
  code: string;
  message: string;
  latency_ms: number;
  tokens: number;
  test_id?: string;
};
export function ModelConnectionDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const connection = useQuery({
    queryKey: ["agent-connection"],
    queryFn: () => api<Connection>("/agent/connection"),
    staleTime: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [base, setBase] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | "disconnect" | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (connection.data && !loaded) {
      setBase(connection.data.base_url);
      setModel(connection.data.model);
      setLoaded(true);
    }
  }, [connection.data, loaded]);
  const dirty = () => {
    setProbe(null);
    setError("");
    setNotice("");
  };
  const normalizedBase = base.trim().replace(/\/+$/, "");
  const canKeep =
    !!connection.data?.has_key && normalizedBase === connection.data.base_url;
  const local = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/.test(
    normalizedBase,
  );
  const valid =
    !!model.trim() && !!base.trim() && (!!key.trim() || canKeep || local);
  function payload() {
    return {
      revision: connection.data!.revision,
      base_url: normalizedBase,
      model: model.trim(),
      api_key: key.trim(),
      keep_key: !key.trim() && canKeep,
    };
  }
  const request = (method: string, body: unknown) => ({
    ...send(method, body),
    headers: { "X-LabFlow-Connection": "1" },
  });
  async function updated(value: Connection) {
    qc.setQueryData(["agent-connection"], value);
    await qc.invalidateQueries({ queryKey: ["agent-provider"] });
    setBase(value.base_url);
    setModel(value.model);
    setKey("");
    setVisible(false);
    setProbe(null);
  }
  async function perform(action: "test" | "save" | "disconnect") {
    if (!connection.data) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      if (action === "test") {
        setProbe(null);
        setProbe(
          await api<Probe>(
            "/agent/connection/test",
            request("POST", { ...payload(), allow_test: consent }),
          ),
        );
      } else if (action === "save") {
        const body = {
          ...payload(),
          ...(probe?.ok && probe.test_id ? { test_id: probe.test_id } : {}),
        };
        await updated(
          await api<Connection>("/agent/connection", request("PUT", body)),
        );
        setNotice("连接已应用");
      } else {
        await updated(
          await api<Connection>(
            "/agent/connection/disconnect",
            request("POST", { revision: connection.data.revision }),
          ),
        );
        setNotice("已断开连接");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      closeDisabled={!!busy}
      title="模型连接"
      description="接入你选择的兼容模型服务。"
      className="model-connection-dialog"
    >
      {connection.isPending ? (
        <div className="connection-loading" role="status">
          <Loader2 size={18} className="connection-spin" />
          正在读取连接…
        </div>
      ) : connection.isError ? (
        <div role="alert" className="connection-feedback error">
          {connection.error.message}
          <Button variant="outline" onClick={() => connection.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <>
          <div className="connection-summary">
            <span className="connection-mark">
              <PlugZap size={21} />
            </span>
            <div>
              <strong>{connection.data?.model || "尚未连接"}</strong>
              <span>
                {connection.data?.available
                  ? connection.data.verified_at
                    ? "已验证"
                    : "已填写，尚未验证"
                  : "配置后即可使用绘图助手"}
              </span>
            </div>
            <span
              className={`connection-dot ${connection.data?.verified_at ? "verified" : ""}`}
              aria-hidden="true"
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !busy) void perform("save");
            }}
          >
            <div className="connection-form-body">
              <fieldset disabled={!!busy || !loaded}>
                <label>
                  接口地址
                  <input
                    type="url"
                    autoFocus
                    value={base}
                    maxLength={1024}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="https://example.com/v1"
                    onChange={(e) => {
                      setBase(e.target.value);
                      dirty();
                    }}
                  />
                </label>
                <label>
                  模型名称
                  <input
                    value={model}
                    maxLength={200}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="填写服务商提供的模型 ID"
                    onChange={(e) => {
                      setModel(e.target.value);
                      dirty();
                    }}
                  />
                </label>
                <label>
                  API Key
                  <div className="connection-key">
                    <input
                      type={visible ? "text" : "password"}
                      value={key}
                      maxLength={4096}
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder={
                        canKeep
                          ? "已配置，留空保留"
                          : local
                            ? "本机服务可留空"
                            : "输入 API Key"
                      }
                      onChange={(e) => {
                        setKey(e.target.value);
                        dirty();
                      }}
                    />
                    <button
                      type="button"
                      aria-label={visible ? "隐藏密钥" : "显示密钥"}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              </fieldset>
              {!!connection.data?.has_key && !canKeep && (
                <p className="connection-hint">地址已更换，请填写新密钥。</p>
              )}
              <p className="connection-hint">
                密钥只保存在本机 LabFlow 服务的内存中，不写入磁盘；重启 LabFlow 后需要重新填写。
              </p>
              <label className="connection-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={!!busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                允许发送两条固定测试请求，服务商可能计费。
              </label>
              {probe && (
                <div
                  role={probe.ok ? "status" : "alert"}
                  className={`connection-feedback ${probe.ok ? "success" : "error"}`}
                >
                  {probe.ok && <Check size={16} />}
                  <div>
                    <strong>{probe.message}</strong>
                    <span>
                      {probe.ok
                        ? `响应 ${(probe.latency_ms / 1000).toFixed(1)} 秒 · 应用后生效`
                        : "当前连接未改变"}
                    </span>
                  </div>
                </div>
              )}
              {error && (
                <div role="alert" className="connection-feedback error">
                  {error}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      setLoaded(false);
                      setProbe(null);
                      setKey("");
                      await connection.refetch();
                    }}
                  >
                    重新读取
                  </Button>
                </div>
              )}
              {notice && (
                <p role="status" className="connection-notice">
                  <Check size={15} />
                  {notice}
                </p>
              )}
            </div>
            <div className="connection-footer">
              <Button
                type="button"
                variant="ghost"
                disabled={!!busy || !connection.data?.available}
                onClick={() => perform("disconnect")}
              >
                <Unplug size={15} />
                断开
              </Button>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!busy || !valid || !consent}
                  onClick={() => perform("test")}
                >
                  {busy === "test" && (
                    <Loader2 size={15} className="connection-spin" />
                  )}
                  {busy === "test" ? "正在测试…" : "测试连接"}
                </Button>
                <Button type="submit" disabled={!!busy || !valid}>
                  {busy === "save" && (
                    <Loader2 size={15} className="connection-spin" />
                  )}
                  应用连接
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </Dialog>
  );
}
