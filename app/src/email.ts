interface SignInEmail { apiKey: string; from: string; to: string; url: string; code: string }
interface InvitationEmail { apiKey: string; from: string; to: string; url: string }

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
export async function sendInvitationEmail(input:InvitationEmail):Promise<void>{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${input.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:input.from,to:[input.to],subject:"You’re invited to BoardGameEngine",text:`You’re invited to BoardGameEngine.\n\nSign in here: ${input.url}\n\nThis invitation was sent by the BoardGameEngine administrator.`})});if(!response.ok)throw new Error(`Resend rejected the invitation (${response.status})`)}
