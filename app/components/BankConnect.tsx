"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TellerConnect?: {
      setup: (opts: any) => { open: () => void };
    };
  }
}

/**
 * Hardened Teller Connect launcher:
 * - Loads the Teller script once
 * - Initializes the Connect instance
 * - Logs the full onSuccess payload
 * - Sends either accessToken OR code to /api/teller/enroll
 */
export default function BankConnect() {
  const connectRef = useRef<{ open: () => void } | null>(null);

  useEffect(() => {
    const id = "teller-connect-js";
    if (document.getElementById(id)) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://cdn.teller.io/connect/connect.js";
    s.onload = init;
    s.onerror = () => console.error("[Teller] script failed to load");
    document.body.appendChild(s);
  }, []);

  function init() {
    if (!window.TellerConnect || connectRef.current) return;

    connectRef.current = window.TellerConnect.setup({
      applicationId: process.env.NEXT_PUBLIC_TELLER_APP_ID!,
      environment: (process.env.NEXT_PUBLIC_TELLER_ENV || "sandbox").toLowerCase(),
      products: ["transactions"],

      // IMPORTANT: log exactly what Teller returns so we can act on it
      onSuccess: async (payload: any) => {
        try {
          console.log("[Teller] onSuccess payload:", payload);

          // Case 1: Teller returns an access token directly
          if (payload?.accessToken) {
            const res = await fetch("/api/teller/enroll", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessToken: payload.accessToken }),
            });
            const data = await res.json().catch(() => ({}));
            console.log("[Teller] enroll(accessToken) →", res.status, data);
            if (!res.ok) throw new Error("Enroll(accessToken) failed");
            window.location.href = "/settings/banking?connected=1";
            return;
          }

          // Case 2: Teller returns a short-lived code / enrollment token
          const code =
            payload?.code ||
            payload?.enrollmentToken ||
            payload?.enrollment_token ||
            payload?.enrollment?.token ||
            payload?.enrollment?.enrollment_token ||
            payload?.enrollment?.code;

          if (code) {
            const res = await fetch("/api/teller/enroll", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const data = await res.json().catch(() => ({}));
            console.log("[Teller] enroll(code) →", res.status, data);
            if (!res.ok) throw new Error("Enroll(code) failed");
            window.location.href = "/settings/banking?connected=1";
            return;
          }

          // If neither found, surface it so we can adapt quickly
          alert("Teller returned an unexpected payload. Check the Console logs.");
        } catch (err) {
          console.error("[Teller] enroll error:", err);
          window.location.href = "/settings/banking?bank_error=save_failed";
        }
      },

      onExit: () => console.log("[Teller] user exited connect"),
    });
  }

  return (
    <button
  onClick={() => connectRef.current?.open()}
  className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
>
  Connect your bank
</button>
  );
}
