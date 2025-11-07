// app/api/teller/token/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

/**
 * Exchanges a Teller authorization code for an access token.
 * Uses JWT (EdDSA) signed with your Teller app's private key.
 */
export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: "missing_code" }, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_TELLER_APP_ID || "";
    const keyPath =
      process.env.TELLER_PRIVATE_KEY_PATH || "./app/keys/teller_private.pem";

    if (!appId) {
      return NextResponse.json({ error: "missing_app_id" }, { status: 500 });
    }

    const privateKey = fs.readFileSync(path.resolve(keyPath), "utf8");

    // JWT for Teller OAuth
    const aud = "https://api.teller.io";
    const token = jwt.sign(
      {
        iss: appId,
        aud,
        sub: "exchange_code",
        exp: Math.floor(Date.now() / 1000) + 60, // 60s
      },
      privateKey,
      { algorithm: "EdDSA" }
    );

    const res = await fetch(`${aud}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ code }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "token_exchange_failed", status: res.status, body: data },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
