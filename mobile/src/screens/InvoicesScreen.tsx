import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiGet } from "../lib/client";
import { colors, radius } from "../theme";
import { centsToDollars } from "./TodayScreen";

interface InvoiceItem {
  id: string;
  status: string;
  total_cents: number | null;
  line_count: number;
  vendor: { name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  processing: "Reading…",
  needs_review: "Ready to review",
  partial: "Needs a look",
  confirmed: "In catalog",
  failed: "Failed",
};

export function InvoicesScreen() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<{ invoices: InvoiceItem[] }>("/api/v1/invoices");
      setInvoices(data.invoices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    load();
    // Poll while anything is still extracting.
    const timer = setInterval(() => {
      if (invoices.some((i) => i.status === "processing")) load();
    }, 4000);
    return () => clearInterval(timer);
  }, [load, invoices]);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={invoices}
      keyExtractor={(item) => item.id}
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
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={
        <View style={styles.card}>
          <Text style={styles.muted}>
            Snap your first invoice — it shows up here.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const live = item.status === "processing";
        return (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.vendor}>
                {item.vendor?.name ?? "Reading vendor…"}
              </Text>
              <Text style={styles.muted}>
                {item.line_count} lines
                {item.total_cents != null
                  ? ` · ${centsToDollars(item.total_cents)}`
                  : ""}
              </Text>
            </View>
            <Text style={[styles.status, live && styles.statusLive]}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  cardMain: { flex: 1 },
  vendor: { color: colors.text, fontWeight: "600", fontSize: 15 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 2 },
  status: { color: colors.muted, fontSize: 12 },
  statusLive: { color: colors.accent },
  error: { color: colors.danger, marginBottom: 8 },
});
