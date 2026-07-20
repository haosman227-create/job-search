import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SignInScreen } from "./src/screens/SignInScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { SnapScreen } from "./src/screens/SnapScreen";
import { InvoicesScreen } from "./src/screens/InvoicesScreen";
import { signOut, signedIn } from "./src/lib/client";
import { colors } from "./src/theme";

/**
 * Margin mobile (V2-4): the stockroom companion. Three tabs, one job —
 * snap invoices, watch costs. Consumes the exact same /api/v1 as the web
 * dashboard (SPEC-V2 §4); a deliberate useState tab bar keeps the dependency
 * tree tiny for v1 (no navigation library).
 */

type Tab = "today" | "snap" | "invoices";

export default function App() {
  const [authed, setAuthed] = useState(signedIn());
  const [tab, setTab] = useState<Tab>("snap");

  if (!authed) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <SignInScreen onSignedIn={() => setAuthed(true)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>
          Margin<Text style={{ color: colors.accent }}>.</Text>
        </Text>
        <Pressable
          onPress={() => {
            signOut();
            setAuthed(false);
          }}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {tab === "today" && <TodayScreen />}
        {tab === "snap" && <SnapScreen onUploaded={() => setTab("invoices")} />}
        {tab === "invoices" && <InvoicesScreen />}
      </View>

      <View style={styles.tabBar}>
        {(
          [
            ["today", "Today"],
            ["snap", "Snap"],
            ["invoices", "Invoices"],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} style={styles.tab} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: "700" },
  signOut: { color: colors.muted, fontSize: 13 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabText: { color: colors.muted, fontSize: 14 },
  tabActive: { color: colors.accent, fontWeight: "600" },
});
