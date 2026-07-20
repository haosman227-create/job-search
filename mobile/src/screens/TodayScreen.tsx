import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiGet } from "../lib/client";
import { colors, radius } from "../theme";

/** Same shapes the web dashboard reads from /api/v1. */
interface Usage {
  usage: {
    plan: { name: string };
    invoices: { used: number; limit: number; remaining: number };
  };
}
interface Insight {
  kind: string;
  changePct: number;
  summary: string;
}

function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function TodayScreen() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [u, i] = await Promise.all([
        apiGet<Usage>("/api/v1/usage"),
        apiGet<{ insights: Insight[] }>("/api/v1/insights"),
      ]);
      setUsage(u);
      setInsights(i.insights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      {error && <Text style={styles.error}>{error}</Text>}

      {usage && (
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>INVOICES LEFT</Text>
            <Text style={styles.statValue}>
              {usage.usage.invoices.remaining}
            </Text>
            <Text style={styles.statSub}>
              of {usage.usage.invoices.limit} · {usage.usage.plan.name}
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Price watch</Text>
      {insights.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.mutedText}>Prices are holding steady.</Text>
        </View>
      ) : (
        insights.slice(0, 6).map((insight, index) => {
          const good = insight.kind === "price_drop";
          return (
            <View key={index} style={styles.card}>
              <Text style={[styles.badge, good ? styles.badgeGood : styles.badgeBad]}>
                {insight.changePct > 0 ? "+" : ""}
                {insight.changePct}%
              </Text>
              <Text style={styles.cardText}>{insight.summary}</Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  statRow: { flexDirection: "row", gap: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 18,
  },
  statLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1 },
  statValue: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "700",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  statSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionTitle: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 16,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeGood: { color: "#ffffff", backgroundColor: colors.positive },
  badgeBad: { color: "#ffffff", backgroundColor: colors.danger },
  cardText: { color: colors.text, flex: 1, fontSize: 14 },
  mutedText: { color: colors.muted },
  error: { color: colors.danger },
});

// Exported for reuse by sibling screens.
export { centsToDollars };
