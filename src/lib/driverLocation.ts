import { supabase } from "@/integrations/supabase/client";

type UpdateLocationInput = {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speedKph?: number | null;
  isOnline: boolean;
};

export async function upsertDriverLocation(input: UpdateLocationInput) {
  const { error } = await (supabase as any)
    .from("driver_locations")
    .upsert({
      driver_id: input.driverId,
      user_id: input.userId,
      lat: input.lat,
      lng: input.lng,
      heading: input.heading ?? null,
      speed_kph: input.speedKph ?? null,
      is_online: input.isOnline,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "driver_id" });
  if (error) throw error;
}

export async function setDriverOffline(driverId: string) {
  const { error } = await (supabase as any)
    .from("driver_locations")
    .update({ is_online: false, updated_at: new Date().toISOString() })
    .eq("driver_id", driverId);
  if (error) throw error;
}
