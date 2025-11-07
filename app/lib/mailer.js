// app/lib/mailer.js
/**
 * Minimal email sender for waitlist confirmation using Resend.
 * Trims the API key to avoid hidden whitespace causing 401s.
 */
export async function sendWaitlistEmail(to, confirmUrl) {
  const rawKey = process.env.RESEND_API_KEY
  const apiKey = rawKey ? rawKey.trim() : ''
  const from = process.env.WAITLIST_FROM_EMAIL || 'WriteOffs <noreply@writeoffs.io>'

  if (!apiKey || !apiKey.startsWith('re_')) {
    throw new Error('RESEND_API_KEY is not set or malformed')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Confirm your spot on the WriteOffs waitlist',
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
          <h2 style="margin:0 0 8px 0">Confirm your email</h2>
          <p style="margin:0 0 16px 0">Tap the button to confirm your spot on the waitlist.</p>
          <p style="margin:0 0 16px 0">
            <a href="${confirmUrl}" style="display:inline-block;padding:12px 16px;background:#059669;color:#fff;border-radius:10px;text-decoration:none">
              Confirm my email
            </a>
          </p>
          <p style="font-size:12px;color:#475569;margin:0">
            If the button doesn’t work, copy and paste this link:<br/>
            <span style="word-break:break-all">${confirmUrl}</span>
          </p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${text}`)
  }

  return true
}


