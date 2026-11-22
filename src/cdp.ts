/**
 * A headless Chromium driven directly over the DevTools Protocol -- no puppeteer -- so the axe
 * run can plant a session, choose a theme before the app boots, and click its way into dialogs.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readyExpression } from "./boot.ts";
import type { Plan } from "./types.ts";
import { PROFILE_DIR } from "./browser.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One entry of the browser's /json/list. */
interface CdpTarget {
  type: string;
  webSocketDebuggerUrl?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export async function launchCdp(
  browser: string,
  port = 9333
): Promise<{ proc: ChildProcess; wsUrl: string }> {
  const proc = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 80; i++) {
    const list = (await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((x) => x.json())
      .catch(() => null)) as CdpTarget[] | null;
    const wsUrl = Array.isArray(list)
      ? list.find((t) => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
      : undefined;
    if (wsUrl) return { proc, wsUrl };
    await sleep(250);
  }
  proc.kill();
  throw new Error("CDP endpoint never became available");
}

export class Cdp {
  private id = 0;
  private pending = new Map<number, Pending>();
  private ws: WebSocket;
  /** The plan's `ready` block: what "this route has rendered" means. */
  private ready: Plan["ready"];

  constructor(ws: WebSocket, ready: Plan["ready"]) {
    this.ws = ws;
    this.ready = ready;
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown; error?: unknown };
      const entry = m.id ? this.pending.get(m.id) : undefined;
      if (!m.id || !entry) return;
      this.pending.delete(m.id);
      if (m.error) entry.reject(new Error(JSON.stringify(m.error)));
      else entry.resolve(m.result);
    });
  }

  static async connect(wsUrl: string, ready: Plan["ready"]): Promise<Cdp> {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    return new Cdp(ws, ready);
  }

  close(): void {
    this.ws.close();
  }

  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async goto(url: string): Promise<boolean> {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) {
      if ((await this.eval("document.readyState").catch(() => null)) === "complete") break;
      await sleep(150);
    }
    return this.waitForApp();
  }

  /**
   * Clicks the first match once it is there and enabled, and says whether it managed to.
   *
   * The wait is the whole point: controls are often disabled while their panel fetches, and
   * `el.click()` on a disabled button does nothing at all -- silently, so the step "succeeds"
   * and the state never opens.
   */
  async click(selector: string, tries = 40): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      const clicked = await this.eval<boolean>(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
          el.click();
          return true;
        })()`
      ).catch(() => false);
      if (clicked) return true;
      await sleep(150);
    }
    return false;
  }

  /** Polls for a selector to exist. Returns false rather than throwing when it never does. */
  async waitForSelector(selector: string, tries = 40): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      const there = await this.eval<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`).catch(
        () => false
      );
      if (there) return true;
      await sleep(150);
    }
    return false;
  }

  /**
   * Waits for the app to have rendered something worth auditing (see readyExpression), then
   * settles, because views fetch on mount and paint a skeleton first. Says whether it got there.
   */
  async waitForApp(): Promise<boolean> {
    const { settleMs, timeoutMs } = this.ready;
    const expression = readyExpression(this.ready);
    let ready = false;
    for (let waited = 0; waited < timeoutMs; waited += 250) {
      ready = await this.eval<boolean>(expression).catch(() => false);
      if (ready) break;
      await sleep(250);
    }
    // Content that arrives late -- images, a second fetch -- lands within this window.
    await sleep(settleMs);
    return !!ready;
  }
}
