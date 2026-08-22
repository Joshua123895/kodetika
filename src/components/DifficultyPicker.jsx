import { TIERS } from "../game/arcadeDifficulty";

const GREEN = "#6AAE6F";

/**
 * Easy / Medium / Hard, shared by the arcade quiz games. The choice lives in
 * settings, so it is the same dial on both and it survives the visit.
 */
export default function DifficultyPicker({ tier, onChange, className = "" }) {
  return (
    <div className={`inline-flex items-center gap-1 ${className}`} role="group" aria-label="Difficulty">
      {TIERS.map((t) => {
        const active = tier === t.tier;
        return (
          <button
            key={t.tier}
            onClick={() => onChange(t.tier)}
            aria-pressed={active}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
            style={{
              background: active ? GREEN : "var(--bg-surface)",
              color: active ? "#fff" : "var(--text-secondary)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
