import { scorePassword } from "@/lib/validation";

const barColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-teal-500", "bg-emerald-400"];

export default function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const { score, label } = scorePassword(value);
  return (
    <div className="mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score ? barColors[score] : "bg-gray-700"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Strength: <span className="text-gray-200">{label}</span>
      </p>
    </div>
  );
}
