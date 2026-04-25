import { useState, useEffect } from "react";
import { Plus, Search, Pin, Trash2, Pencil } from "lucide-react";
import { listRoles, deleteRole, togglePinRole } from "@/lib/tauri";
import type { Role } from "@/types/role";

interface Props {
  onEdit: (role: Role) => void;
  onClose: () => void;
}

export default function RoleLibraryPanel({ onEdit, onClose: _onClose }: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRoles = async () => {
    try {
      const result = await listRoles(search || undefined);
      setRoles(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRoles(); }, [search]);

  const handleDelete = async (id: string) => {
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      await togglePinRole(id);
      setRoles((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_pinned: !r.is_pinned } : r))
      );
      loadRoles();
    } catch (e) {
      console.error(e);
    }
  };

  const pinned = roles.filter((r) => r.is_pinned);
  const unpinned = roles.filter((r) => !r.is_pinned);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="搜索角色..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 py-1.5 pl-7 pr-3 text-xs text-gray-200 outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => onEdit({ id: "", name: "", description: "", system_prompt: "", tags: [], is_pinned: false, created_at: "", updated_at: "" })}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> 添加
        </button>
      </div>

      {loading && <p className="text-center text-xs text-gray-500">加载中...</p>}

      {!loading && roles.length === 0 && (
        <p className="py-8 text-center text-xs text-gray-600">
          暂无自定义角色，点击 [添加] 创建你的第一个 AI 专家
        </p>
      )}

      {pinned.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium text-amber-400">置顶角色</p>
          {pinned.map((role) => (
            <RoleItem key={role.id} role={role} onEdit={onEdit} onDelete={handleDelete} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}

      {pinned.length > 0 && unpinned.length > 0 && <div className="border-t border-gray-800" />}

      {unpinned.length > 0 && (
        <div>
          {pinned.length > 0 && <p className="mb-1 text-[10px] font-medium text-gray-500">其他角色</p>}
          {unpinned.map((role) => (
            <RoleItem key={role.id} role={role} onEdit={onEdit} onDelete={handleDelete} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleItem({
  role,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  role: Role;
  onEdit: (r: Role) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  return (
    <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-800">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-gray-200">{role.name}</p>
        <p className="truncate text-[10px] text-gray-500">{role.description}</p>
        {role.tags.length > 0 && (
          <div className="mt-0.5 flex gap-1">
            {role.tags.map((t) => (
              <span key={t} className="rounded bg-gray-700 px-1.5 py-0.5 text-[9px] text-gray-400">
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 line-clamp-2 text-[10px] text-gray-600">{role.system_prompt}</p>
      </div>
      <div className="ml-2 hidden gap-0.5 group-hover:flex">
        <button
          onClick={() => onTogglePin(role.id)}
          className="rounded p-1 text-gray-500 hover:text-amber-400"
          title={role.is_pinned ? "取消置顶" : "置顶"}
        >
          <Pin className="h-3 w-3" fill={role.is_pinned ? "currentColor" : "none"} />
        </button>
        <button
          onClick={() => onEdit(role)}
          className="rounded p-1 text-gray-500 hover:text-blue-400"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => onDelete(role.id)}
          className="rounded p-1 text-gray-500 hover:text-red-400"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
