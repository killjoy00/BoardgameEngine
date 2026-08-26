interface SignInEmail { apiKey: string; from: string; to: string; url: string; code: string }

export async function sendSignInEmail(input: SignInEmail): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: "Sign in to BoardGameEngine",
      text: [
        "Sign in to BoardGameEngine", "",
        "Opening this link will not consume it. Confirm sign-in on the page to continue.", input.url, "",
        `Or paste this code: ${input.code}`, "",
        "This sign-in request expires in 30 minutes. If you did not request it, ignore this email."
      ].join("\n")
    })
  });
  if (!response.ok) throw new Error(`Resend rejected the message (${response.status})`);
}
