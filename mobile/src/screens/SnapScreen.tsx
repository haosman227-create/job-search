import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadInvoice } from "../lib/client";
import { colors, radius } from "../theme";

/**
 * The reason the app exists: point the camera at a supplier invoice in the
 * stockroom, tap once, costs land in the catalog in seconds.
 */
export function SnapScreen({ onUploaded }: { onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function capture(fromCamera: boolean) {
    setMessage(null);
    const picker = fromCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    if (fromCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setIsError(true);
        setMessage("Camera permission is needed to snap invoices.");
        return;
      }
    }

    const result = await picker({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      await uploadInvoice(result.assets[0]);
      setIsError(false);
      setMessage("Reading your invoice — costs land in seconds.");
      onUploaded();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      {message && (
        <Text style={[styles.message, isError ? styles.bad : styles.good]}>
          {message}
        </Text>
      )}
      <Pressable
        style={styles.snap}
        onPress={() => capture(true)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.accentText} size="large" />
        ) : (
          <Text style={styles.snapText}>Snap invoice</Text>
        )}
      </Pressable>
      <Pressable onPress={() => capture(false)} disabled={busy}>
        <Text style={styles.libraryText}>Choose from library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    padding: 24,
  },
  snap: {
    backgroundColor: colors.accent,
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  snapText: { color: colors.accentText, fontSize: 20, fontWeight: "700" },
  libraryText: { color: colors.muted, fontSize: 14 },
  message: {
    textAlign: "center",
    fontSize: 15,
    paddingHorizontal: 12,
  },
  good: { color: colors.accent },
  bad: { color: colors.danger },
});
