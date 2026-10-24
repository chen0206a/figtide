import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { type Config } from "../../model";
import { NumberInput, Section, Text } from "../controls";

type AnnotationsTabProps = {
  panel: string;
  c: Config;
  patch: (value: Partial<Config>) => void;
};
export function AnnotationsTab({ panel, c, patch }: AnnotationsTabProps) {
  return (
    <>
      {panel === "annotations" && (
        <Section title="文本注释">
          <p className="tiny-note">
            位置采用画布比例坐标：0 为左 / 下，1 为右 / 上。
          </p>
          {c.annotations.map((a, i) => (
            <div className="annotation-item" key={a.id}>
              <Text
                label={`注释 ${i + 1}`}
                value={a.text}
                onChange={(text) =>
                  patch({
                    annotations: c.annotations.map((v) =>
                      v.id === a.id ? { ...v, text } : v,
                    ),
                  })
                }
              />
              <div className="form-grid">
                <NumberInput
                  label="X 位置"
                  value={a.x}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(x) =>
                    patch({
                      annotations: c.annotations.map((v) =>
                        v.id === a.id ? { ...v, x } : v,
                      ),
                    })
                  }
                />
                <NumberInput
                  label="Y 位置"
                  value={a.y}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(y) =>
                    patch({
                      annotations: c.annotations.map((v) =>
                        v.id === a.id ? { ...v, y } : v,
                      ),
                    })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch({
                    annotations: c.annotations.filter((v) => v.id !== a.id),
                  })
                }
              >
                <Trash2 size={13} />
                删除注释
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                annotations: [
                  ...c.annotations,
                  {
                    id: crypto.randomUUID(),
                    text: "Observation",
                    x: 0.5,
                    y: 0.9,
                  },
                ],
              })
            }
          >
            <Plus size={13} />
            添加文本注释
          </Button>
        </Section>
      )}
    </>
  );
}
