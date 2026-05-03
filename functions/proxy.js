// Cloudflare Pages Function — /functions/proxy.js
// Αυτόματα γίνεται διαθέσιμο ως https://yoursite.pages.dev/proxy

export async function onRequestPost(context) {
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyeyxcBdvsNB3ZPX1YO6f71qQk1btl1X3BvwQmmomO4AwmNQ51oFMR4MXP30gmmuqb4SA/exec";

  try {
    const body = await context.request.text();

    const response = await fetch(APPS_SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    body,
      redirect: "follow", // ακολουθεί το 302 του Apps Script
    });

    const text = await response.text();

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
