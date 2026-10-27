import { useEffect, useRef, useState } from "react";
import { guestConsole } from "@/lib/cloud/guest-hardware";

export function ConsolePage() {
  const [session, setSession] = useState("");
  const [name, setName] = useState("Console");
  const [text, setText] = useState("Connecting…");
  const screen = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session") ?? "";
    setName(params.get("name") || "Console");
    if (!/^[0-9a-f]{32}$/.test(id)) {
      setText("This console link is not valid. Open it from the instance page.");
      return;
    }
    setSession(id);
    setText("");
  }, []);

  useEffect(() => {
    if (session) screen.current?.focus();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    let offset = 0;
    const timer = setInterval(() => {
      void guestConsole({ data: { action: "read", id: session, offset } }).then((result) => {
        if (stop) return;
        if (result.text) {
          offset = result.next;
          setText((current) => (current + result.text).slice(-80000));
          const node = screen.current;
          if (node) node.scrollTop = node.scrollHeight;
        }
        if (result.closed) setText((current) => current + "\nConsole closed.\n");
      }).catch(() => undefined);
    }, 400);
    const close = () => {
      void guestConsole({ data: { action: "close", id: session } });
    };
    window.addEventListener("pagehide", close);
    return () => {
      stop = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", close);
    };
  }, [session]);

  function sendKey(key: string) {
    if (!session || !key) return;
    void guestConsole({ data: { action: "write", id: session, text: key } });
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 px-3 text-xs text-zinc-400">
        <span>{name}</span>
        <button
          type="button"
          className="rounded px-2 py-1 text-zinc-200 hover:bg-zinc-800"
          onClick={() => {
            if (session) void guestConsole({ data: { action: "close", id: session } });
            window.close();
          }}
        >Close</button>
      </div>
      <pre
        ref={screen}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-sm outline-none"
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); sendKey("\n"); return; }
          if (event.key === "Backspace") { event.preventDefault(); sendKey("\u007f"); return; }
          if (event.key === "Tab") { event.preventDefault(); sendKey("\t"); return; }
          if (event.ctrlKey && event.key === "c") { event.preventDefault(); sendKey("\u0003"); return; }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); sendKey(event.key); }
        }}
      >{text}</pre>
    </div>
  );
}
