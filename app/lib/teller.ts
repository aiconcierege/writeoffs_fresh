// app/lib/teller.ts
import fs from "fs";
import path from "path";
import { Agent } from "undici";
import { createServerSupabase } from "../../utils/supabase/server";

// Keep one shared mTLS agent for all Teller requests
let _dispatcher: Agent | null = null;

export function tellerDispatcher() {
  if (_dispatcher) return _dispatcher;

  const certPath = process.env.TELLER_CLIENT_CERT_PATH || "./app/keys/certificate.pem";
  const keyPath  = process.env.TELLER_CLIENT_KEY_PATH  || "./app/keys/teller_private.pem";

  const certAbs = path.resolve(certPath);
  const keyAbs  = path.resolve(keyPath);

  const cert = fs.readFileSync(certAbs);
  const key  = fs.readFileSync(keyAbs);

  console.log("[teller][mtls] cert path:", certAbs, "bytes:", cert.length);
  console.log("[teller][mtls] key  path:", keyAbs,  "bytes:", key.length);

  _dispatcher = new Agent({
    connect: {
      cert,
      key,
      // TLS verification ON by default
    },
  });

  return _dispatcher;
}

// Teller uses the same host; the token determines env
export function tellerApiBase() {
  return "https://api.teller.io";
}

// Retrieves the user's Teller access token from Supabase
export async function getTellerAccessToken() {
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("no_user");

  const { data, error } = await supabase
    .from("bank_connections")
    .select("token_json")
    .eq("user_id", user.id)
    .eq("provider", "teller")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.token_json) throw new Error("no_teller_token");

  const json = typeof data.token_json === "string"
    ? JSON.parse(data.token_json)
    : data.token_json;

  const token = json?.access_token;
  if (!token) throw new Error("no_teller_token");

  return token as string;
}
