import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { sshInvocation } from "@/lib/cloud/ssh-auth.server";

type Session = {
  id: string;
  child: ChildProcess;
  text: string;
  closed: boolean;
  timer: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, Session>();

function which(bin: string) {
  return new Promise<string | null>((resolve) => {
    const child = spawn("which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? out.trim() || bin : null));
  });
}

function push(session: Session, chunk: string) {
  session.text = (session.text + chunk).slice(-80000);
  clearTimeout(session.timer);
  session.timer = setTimeout(() => closeConsole(session.id), 10 * 60 * 1000);
}

export async function openConsole(input: { name: string; address: string; port: number; login: string; password: string }) {
  const ssh = await which("ssh");
  if (!ssh) return { ok: false as const, id: "", message: "The ssh client is not installed on the console." };
  if (sessions.size > 8) return { ok: false as const, id: "", message: "Too many consoles are open. Close one first." };
  const target = `${input.login || "root"}@${input.address}`;
  const remote = `virsh -c qemu:///system console ${input.name} --force`;
  const call = await sshInvocation({ ssh, port: input.port || 22, target, remote, password: input.password });
  const child = spawn(call.command, ["-tt", ...call.args], { env: call.env, stdio: ["pipe", "pipe", "pipe"] });
  const id = randomBytes(16).toString("hex");
  const session: Session = {
    id,
    child,
    text: "",
    closed: false,
    timer: setTimeout(() => closeConsole(id), 10 * 60 * 1000),
  };
  sessions.set(id, session);
  child.stdout?.on("data", (chunk) => push(session, String(chunk)));
  child.stderr?.on("data", (chunk) => push(session, String(chunk)));
  child.on("close", () => {
    session.closed = true;
    void call.cleanup();
  });
  child.on("error", () => {
    session.closed = true;
    session.text += "\nThe console process failed.\n";
    void call.cleanup();
  });
  return { ok: true as const, id, message: "Console opened. A cloud image shows a login prompt only when its serial console is enabled." };
}

export function readConsole(id: string, offset: number) {
  const session = sessions.get(id);
  if (!session) return { ok: false, text: "", next: offset, closed: true };
  const start = Number.isFinite(offset) && offset >= 0 && offset <= session.text.length ? offset : 0;
  return { ok: true, text: session.text.slice(start), next: session.text.length, closed: session.closed };
}

export function writeConsole(id: string, text: string) {
  const session = sessions.get(id);
  if (!session || session.closed || !session.child.stdin) return { ok: false };
  session.child.stdin.write(text);
  return { ok: true };
}

export function closeConsole(id: string) {
  const session = sessions.get(id);
  if (!session) return { ok: true };
  clearTimeout(session.timer);
  session.child.kill("SIGKILL");
  sessions.delete(id);
  return { ok: true };
}
