import { useState } from "react";
import type { Role } from "@/types/role";
import { createRole, updateRole } from "@/lib/tauri";

interface Props {
  id?: string;
  role?: Role;
  onSaved: () => void;
  onCancel: () => void;
}

export default function RoleForm({ id, role, onSaved, onCancel }: Props) {
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(role?.system_prompt || "");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>(role?.tags || []);
  const [isPinned, setIsPinned] = useState(role?.is_pinned || false);
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = tagsInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagsInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (id && role) {
        await updateRole(id, {
          name,
          description,
          system_prompt: systemPrompt,
          tags,
          is_pinned: isPinned,
        });
      } else {
        await createRole({
          name,
          description,
          system_prompt: systemPrompt,
          tags,
          is_pinned: isPinned,
        });
      }
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-500">角色名称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 Python 专家"
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">描述</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简短描述此角色的用途"
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="输入 System Prompt..."
          rows={8}
          className="mt-1 w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">标签</label>
        <div className="mt-1 flex gap-1">
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="输入后按 Enter 添加"
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300"
              >
                {t}
                <button onClick={() => removeTag(t)} className="text-gray-500 hover:text-red-400">x</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
          className="text-blue-500"
        />
        置顶
      </label>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          取消
        </button>
      </div>
    </div>
  );
}
