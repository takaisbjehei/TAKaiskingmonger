import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export async function getEnabledMode() {
  const { data, error } = await supabase
    .from("modes")
    .select("name, description, model, greeting, enabled")
    .eq("enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) {
    console.error("Supabase error:", error);
    return null;
  }
  return data;
}
