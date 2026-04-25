export default function StatusBar() {
  const activeSub = "Claude Pro";
  const activeModel = "Sonnet 4.6";
  const activeRole = "Python 专家";

  return (
    <div className="flex h-7 items-center justify-between border-t border-gray-800 bg-gray-900 px-3 text-xs text-gray-500">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span>
          {activeSub} ({activeModel})
        </span>
      </div>
      <span>角色: {activeRole}</span>
    </div>
  );
}
