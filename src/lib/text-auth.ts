// The iMessage relay (bot/) proves it's ours with a shared secret, so random people
// can't post reports or burn Gemini quota through the texting API.
export function textBotAuthorized(req: Request): Response | null {
  const secret = process.env.TEXT_BOT_SECRET;
  if (!secret) return Response.json({ error: "Texting is not set up (TEXT_BOT_SECRET missing)." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
