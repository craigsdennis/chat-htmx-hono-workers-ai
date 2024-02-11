import { Ai } from "@cloudflare/ai";
import { Hono } from "hono";
import { html, raw } from "hono/html";
import { serveStatic } from "hono/cloudflare-workers";
import markdownit from "markdown-it";
import manifest from "__STATIC_CONTENT_MANIFEST";

type Bindings = {
  AI: any;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/*", serveStatic({ root: "./", manifest }));

app.get("/dynamic", (c) => {
  return c.text("Hello Hono!");
});

app.get("/stream-prompt", async (c) => {
  const ai = new Ai(c.env.AI);
  const message = c.req.query("message") || "Tell me that message is required";
  console.log("message in stream", message);
  // TODO: Pull state from KV?
  const stream = await ai.run("@hf/thebloke/llama-2-13b-chat-awq", {
    messages: [{ role: "user", content: message }],
    stream: true,
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream" },
  });
});

app.post("/assistant-message-complete", async (c) => {
  // Update storage
  const vals = await c.req.formData();

  const md = markdownit();
  let message: string = vals.get("message") || "";
  const rendered = md.render(message);
  return c.html(<div class="message assistant rendered">{html`${raw(rendered)}`}</div>);
});

app.post("/add-message", async (c) => {
  const data = await c.req.formData();
  const message: string = data.get("message") || "";
  console.log("message", message);
  return c.html(
    <>
      <div class="message user">{message}</div>
      <div
        class="message assistant"
        hx-post="/assistant-message-complete"
        hx-swap="outerHTML"
        hx-trigger="streamComplete"
        hx-vals='{"message": ""}'
      >
        <div
          id="message-streamer"
          hx-ext="sse"
          sse-connect={"/stream-prompt?message=" + encodeURIComponent(message)}
          sse-swap="message"
          hx-swap="beforeend"
        ></div>
      </div>
    </>
  );
});

export default app;
