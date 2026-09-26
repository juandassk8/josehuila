import { DS } from "../../lib/design.js";
import { daysUntilBirthday, fmtBirthday } from "../../lib/dates.js";

export function BirthdayBanner({ members, currentMemberId }) {
  const upcoming = (members || [])
    .map((m) => ({
      member: m,
      days: daysUntilBirthday(m.birthday_day, m.birthday_month),
    }))
    .filter((x) => x.days != null && x.days <= 7 && x.member.id !== currentMemberId)
    .sort((a, b) => a.days - b.days);

  if (!upcoming.length) return null;

  const next = upcoming[0];
  const label =
    next.days === 0
      ? `🎉 Hoy cumple ${next.member.name}`
      : next.days === 1
      ? `🎂 Mañana cumple ${next.member.name}`
      : `🎂 ${next.member.name} cumple en ${next.days} días`;

  return (
    <div
      style={{
        marginBottom: 20,
        padding: "14px 18px",
        borderRadius: 14,
        background: `linear-gradient(90deg, ${next.member.color || DS.blue}15, rgba(139,92,246,0.08))`,
        border: `1px solid ${next.member.color || DS.blue}40`,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ fontSize: 22 }}>🎂</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: DS.textPrimary, fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ color: DS.textSecondary, fontSize: 11, marginTop: 3 }}>
          {fmtBirthday(next.member.birthday_day, next.member.birthday_month)} — organicen algo especial ✨
        </div>
      </div>
    </div>
  );
}
