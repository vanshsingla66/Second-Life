import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { useToast } from "@/components/Toast";
import { api, errorMessage } from "@/lib/api";
import { assetUrl } from "@/lib/config";

export const MAX_PHOTOS = 6;

export interface Photo {
  key: string;
  uri: string;          // what we show (local file or server URL)
  url: string | null;   // server path once uploaded, e.g. /uploads/abc.jpg
  uploading: boolean;
  failed?: boolean;
}

let seq = 0;
const newKey = () => `p${Date.now()}_${seq++}`;

/** Photos for a listing. Each photo uploads as soon as it is picked, so posting is instant and AI can look at it. */
export function usePhotos(initial: string[] = [], onUploaded?: (urls: string[]) => void) {
  const toast = useToast();
  const [photos, setPhotos] = useState<Photo[]>(() =>
    initial.map((u) => ({ key: newKey(), uri: assetUrl(u) ?? u, url: u, uploading: false })));
  const ref = useRef(photos);
  ref.current = photos;

  const update = (key: string, patch: Partial<Photo>) =>
    setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addAssets = useCallback(async (assets: ImagePicker.ImagePickerAsset[]) => {
    const room = MAX_PHOTOS - ref.current.length;
    if (room <= 0) { toast.show(`You can add up to ${MAX_PHOTOS} photos`, "error"); return; }
    if (assets.length > room) toast.show(`Only the first ${room} photo${room === 1 ? "" : "s"} were added (max ${MAX_PHOTOS})`, "info");
    const fresh: Photo[] = assets.slice(0, room).map((a) => ({ key: newKey(), uri: a.uri, url: null, uploading: true }));
    setPhotos((ps) => [...ps, ...fresh]);
    const done: string[] = [];
    await Promise.all(fresh.map(async (p, i) => {
      try {
        const url = await api.uploadImage(p.uri, assets[i].mimeType ?? "image/jpeg");
        update(p.key, { url, uploading: false });
        done.push(url);
      } catch (e) {
        update(p.key, { uploading: false, failed: true });
        toast.show(`Photo upload failed: ${errorMessage(e)}`, "error");
      }
    }));
    if (done.length) onUploaded?.(done);
  }, [toast, onUploaded]);

  const fromCamera = useCallback(async () => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.show("Camera permission is off. Enable it in Settings to take photos.", "error");
        if (!perm.canAskAgain) Linking.openSettings();
        return;
      }
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!res.canceled) await addAssets(res.assets);
  }, [addAssets, toast]);

  const fromLibrary = useCallback(async () => {
    const room = MAX_PHOTOS - ref.current.length;
    if (room <= 0) { toast.show(`You can add up to ${MAX_PHOTOS} photos`, "error"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.6, allowsMultipleSelection: true, selectionLimit: room, orderedSelection: true,
    });
    if (!res.canceled) await addAssets(res.assets);
  }, [addAssets, toast]);

  const remove = (key: string) => setPhotos((ps) => ps.filter((p) => p.key !== key));
  const makeCover = (key: string) => setPhotos((ps) => {
    const p = ps.find((x) => x.key === key);
    return p ? [p, ...ps.filter((x) => x.key !== key)] : ps;
  });
  const reset = () => setPhotos([]);

  const uploading = photos.some((p) => p.uploading);
  const urls = photos.filter((p) => p.url).map((p) => p.url!) ;
  return { photos, urls, uploading, fromCamera, fromLibrary, remove, makeCover, reset };
}

type Ctl = ReturnType<typeof usePhotos>;

export function PhotoPicker({ ctl, placeholderEmoji = "📷" }: { ctl: Ctl; placeholderEmoji?: string }) {
  const { photos } = ctl;

  if (photos.length === 0) {
    return (
      <View className="mb-4 overflow-hidden rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50 p-5 dark:border-brand-700 dark:bg-brand-900/20">
        <View className="items-center">
          <Text style={{ fontSize: 40 }}>{placeholderEmoji}</Text>
          <Text className="mt-1 text-[16px] font-extrabold text-brand-700 dark:text-brand-300">Add photos of your item</Text>
          <Text className="mt-0.5 text-center text-[12px] text-ink/50 dark:text-white/50">
            Up to {MAX_PHOTOS} photos. Snap one and AI fills in the details for you ✨
          </Text>
        </View>
        <View className="mt-4 flex-row gap-3">
          <BigAction icon="camera" label="Take photo" onPress={ctl.fromCamera} primary />
          <BigAction icon="images" label="Gallery" onPress={ctl.fromLibrary} />
        </View>
      </View>
    );
  }

  return (
    <View className="mb-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
        {photos.map((p, i) => (
          <View key={p.key} style={{ width: i === 0 ? 150 : 110, height: 150 }} className="overflow-hidden rounded-2xl bg-ink/5 dark:bg-white/10">
            <Pressable onPress={() => i > 0 && ctl.makeCover(p.key)} style={{ width: "100%", height: "100%" }}
              accessibilityRole="button" accessibilityLabel={i === 0 ? "Cover photo" : `Photo ${i + 1}, tap to make it the cover`}>
              <Image source={{ uri: p.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </Pressable>
            {p.uploading && (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color="#fff" />
                <Text className="mt-1 text-[11px] font-bold text-white">Uploading…</Text>
              </View>
            )}
            {p.failed && (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center bg-red-900/60">
                <Ionicons name="alert-circle" size={22} color="#fff" />
                <Text className="mt-1 text-[11px] font-bold text-white">Failed</Text>
              </View>
            )}
            {i === 0 && !p.uploading && (
              <View pointerEvents="none" className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5">
                <Text className="text-[11px] font-extrabold text-white">COVER</Text>
              </View>
            )}
            <Pressable onPress={() => ctl.remove(p.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}
              className="absolute right-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-full bg-black/60">
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <View style={{ width: 110, height: 150 }} className="gap-2">
            <SmallAdd icon="camera" label="Camera" onPress={ctl.fromCamera} />
            <SmallAdd icon="images" label="Gallery" onPress={ctl.fromLibrary} />
          </View>
        )}
      </ScrollView>
      <Text className="mt-2 text-[12px] text-ink/50 dark:text-white/50">
        {photos.length}/{MAX_PHOTOS} photos{photos.length > 1 ? " · tap a photo to make it the cover" : ""}
      </Text>
    </View>
  );
}

function BigAction({ icon, label, onPress, primary }: { icon: "camera" | "images"; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${primary ? "bg-brand-500 active:bg-brand-600" : "border border-brand-200 bg-white dark:border-night-line dark:bg-night-card"}`}>
      <Ionicons name={icon} size={20} color={primary ? "#fff" : "#22a355"} />
      <Text className={`text-[15px] font-bold ${primary ? "text-white" : "text-ink dark:text-white"}`}>{label}</Text>
    </Pressable>
  );
}

function SmallAdd({ icon, label, onPress }: { icon: "camera" | "images"; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Add photo from ${label.toLowerCase()}`}
      className="flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/20">
      <Ionicons name={icon} size={20} color="#22a355" />
      <Text className="mt-0.5 text-[12px] font-bold text-brand-700 dark:text-brand-300">{label}</Text>
    </Pressable>
  );
}
