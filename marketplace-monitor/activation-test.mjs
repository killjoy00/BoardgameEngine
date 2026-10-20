// One-time activation verification. No Marketplace listing is claimed or
// implied by this email. GitHub invokes it only for a uniquely marked,
 // reviewed main-branch activation commit.
const key = process.env.RESEND_API_KEY;
const to = process.env.MARKETPLACE_ALERT_TO;
const from = process.env.MARKETPLACE_ALERT_FROM || "Marketplace Alerts <alerts@planitnow.us>";
if (process.env.MARKETPLACE_ACTIVATION_TEST !== "1")
  throw new Error("Activation test requires an explicitly approved run");
if (!key || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
  throw new Error("Activation test requires configured Resend key and alert recipient");

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    "Idempotency-Key": "marketplace-activation-20261020-v1"
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: "Marketplace alerts: Resend activation test",
    text: [
      "This is a one-time test from the new cloud-hosted Marketplace email workflow.",
      "",
      "No matching Marketplace listing is claimed by this test.",
      "Future emails will include only new matching wishlist/Xbox listings or meaningful price changes.",
      "The searches are scheduled roughly every four hours. Empty runs send no notification.",
      "",
      "You do not need to keep a browser open."
    ].join("\n")
  }),
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error("Marketplace activation email was rejected (HTTP " + response.status + ")");
const result = await response.json();
if (!result?.id) throw new Error("Marketplace activation email not acknowledged by Resend");
console.log("Marketplace email activation test accepted by Resend; check provider delivery status.");
