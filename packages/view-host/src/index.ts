import type { Sample } from "@open-device/spec";

export const VIEW_PROTOCOL = "0.1";

export interface ViewIntent {
  intentId: string;
  action: string;
  input: Record<string, unknown>;
}

export interface ViewHostOptions {
  container: HTMLElement;
  /** Complete vendor HTML document (already integrity-verified by the caller). */
  html: string;
  instance: { id: string; title: string };
  theme?: { colorScheme: "light" | "dark"; locale: string };
  onIntent?: (intent: ViewIntent) => void;
}

export interface ViewHost {
  sendState(values: Record<string, Sample>): void;
  destroy(): void;
}

function randomChannel(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const BASELINE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;";

/** Inject the baseline CSP so a dependency view cannot reach the network. */
function withCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${BASELINE_CSP}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${meta}`);
  }
  return `${meta}\n${html}`;
}

/**
 * Render an untrusted vendor view in a sandboxed iframe and speak the
 * `open-device:view-messages@0.1` postMessage protocol with it.
 *
 * The iframe gets `sandbox="allow-scripts"` only — no same-origin, no
 * navigation, no forms, no downloads. The random channel ID travels to the
 * view through the iframe `name` attribute; both sides then validate
 * protocol, channel, source window, and message shape. Intents are user
 * requests, never commands: the embedding host decides what happens next.
 */
export function createViewHost(options: ViewHostOptions): ViewHost {
  const channel = randomChannel();
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.referrerPolicy = "no-referrer";
  iframe.name = channel;
  iframe.style.border = "0";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.srcdoc = withCsp(options.html);

  let sequence = 0;
  let ready = false;
  let pendingState: Record<string, Sample> | undefined;

  function post(message: Record<string, unknown>): void {
    iframe.contentWindow?.postMessage(
      { protocol: VIEW_PROTOCOL, channel, ...message },
      "*",
    );
  }

  function handleMessage(event: MessageEvent): void {
    if (event.source !== iframe.contentWindow) return;
    const data: unknown = event.data;
    if (typeof data !== "object" || data === null) return;
    const message = data as Record<string, unknown>;
    if (message["protocol"] !== VIEW_PROTOCOL || message["channel"] !== channel) return;

    if (message["type"] === "open-device:ready" && !ready) {
      ready = true;
      post({
        type: "open-device:init",
        instance: options.instance,
        theme: options.theme ?? { colorScheme: "light", locale: "en" },
        capabilities: ["emit-intent"],
      });
      if (pendingState !== undefined) {
        const values = pendingState;
        pendingState = undefined;
        post({ type: "open-device:state", sequence: (sequence += 1), values });
      }
      return;
    }

    if (message["type"] === "open-device:intent") {
      if (typeof message["intentId"] !== "string" || typeof message["action"] !== "string") {
        return;
      }
      options.onIntent?.({
        intentId: message["intentId"],
        action: message["action"],
        input:
          typeof message["input"] === "object" && message["input"] !== null
            ? (message["input"] as Record<string, unknown>)
            : {},
      });
    }
  }

  window.addEventListener("message", handleMessage);
  options.container.append(iframe);

  return {
    sendState(values) {
      if (!ready) {
        pendingState = values;
        return;
      }
      post({ type: "open-device:state", sequence: (sequence += 1), values });
    },
    destroy() {
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    },
  };
}
