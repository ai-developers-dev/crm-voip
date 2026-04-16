# Rollback — Revert Twilio Webhooks to Vercel

This file captures the exact Twilio configuration **before** migrating
call/SMS webhooks to Railway on 2026-04-16. If Railway has an outage
or a bad deploy, run the commands below to restore the Vercel URLs.

Railway URL: `https://crm-voip-production.up.railway.app`
Vercel URL (prior): `https://crm-voip-eight.vercel.app`

## What was changed on 2026-04-16

### 1. TwiML App `AP7b3b0e71395f6f0ed80922e5dd4ec209` ("Convex Voip CRM")

This is the app the 855-696-6105 number uses via `voice_application_sid`,
so its `voice_url` is what Twilio actually hits on incoming calls.

| Field | Was (Vercel) | Now (Railway) |
|---|---|---|
| voice_url | `https://crm-voip-eight.vercel.app/api/twilio/voice` | `https://crm-voip-production.up.railway.app/api/twilio/voice` |
| voice_method | POST | POST (unchanged) |

### 2. Phone Number `PNf4e4009039f2674c943d57cd6b1b0433` (+1 855-696-6105)

| Field | Was (Vercel) | Now (Railway) |
|---|---|---|
| voice_url (fallback) | `https://crm-voip-eight.vercel.app/api/twilio/voice` | `https://crm-voip-production.up.railway.app/api/twilio/voice` |
| sms_url | `https://crm-voip-eight.vercel.app/api/twilio/sms` | `https://crm-voip-production.up.railway.app/api/twilio/sms` |
| sms_method | POST | POST (unchanged) |

### Unchanged

- Phone number `PN9955d35c993970c6204e7e76d7aa0516` (+1 877-519-6150) — still
  on the older `voip-crm-kappa.vercel.app` / `voip-saas.vercel.app` URLs.
  Looked like a different project, not touched.
- TwiML App `AP1b816032e7a80b55881992c4858fc78f` ("VOIP CRM") — all URLs
  were empty; not touched. This is what `.env.local` references but isn't
  the one actually driving calls.
- Clerk webhook points at Convex (`*.convex.site/clerk-webhook`), not
  Vercel — no change needed.

## How to roll back (copy-paste)

```bash
# Auth — export these from .env.local before running
#   export TWILIO_ACCOUNT_SID=AC...
#   export TWILIO_AUTH_TOKEN=...
ACC=$TWILIO_ACCOUNT_SID
TOKEN=$TWILIO_AUTH_TOKEN

# 1) Restore TwiML App voice_url
curl -s -u "$ACC:$TOKEN" -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/$ACC/Applications/AP7b3b0e71395f6f0ed80922e5dd4ec209.json" \
  --data-urlencode "VoiceUrl=https://crm-voip-eight.vercel.app/api/twilio/voice" \
  --data-urlencode "VoiceMethod=POST"

# 2) Restore 855-696-6105 voice_url + sms_url
curl -s -u "$ACC:$TOKEN" -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/$ACC/IncomingPhoneNumbers/PNf4e4009039f2674c943d57cd6b1b0433.json" \
  --data-urlencode "VoiceUrl=https://crm-voip-eight.vercel.app/api/twilio/voice" \
  --data-urlencode "VoiceMethod=POST" \
  --data-urlencode "SmsUrl=https://crm-voip-eight.vercel.app/api/twilio/sms" \
  --data-urlencode "SmsMethod=POST"
```

After rollback: verify calls ring by dialing +1 855-696-6105. If agents
receive the call on dashboard, rollback succeeded.

## Forward-apply (the change that was made)

```bash
# 1) TwiML App → Railway
curl -s -u "$ACC:$TOKEN" -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/$ACC/Applications/AP7b3b0e71395f6f0ed80922e5dd4ec209.json" \
  --data-urlencode "VoiceUrl=https://crm-voip-production.up.railway.app/api/twilio/voice" \
  --data-urlencode "VoiceMethod=POST"

# 2) 855 number → Railway (voice fallback + sms)
curl -s -u "$ACC:$TOKEN" -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/$ACC/IncomingPhoneNumbers/PNf4e4009039f2674c943d57cd6b1b0433.json" \
  --data-urlencode "VoiceUrl=https://crm-voip-production.up.railway.app/api/twilio/voice" \
  --data-urlencode "VoiceMethod=POST" \
  --data-urlencode "SmsUrl=https://crm-voip-production.up.railway.app/api/twilio/sms" \
  --data-urlencode "SmsMethod=POST"
```
