import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function sshInvocation(input: {
  ssh: string;
  port: number;
  target: string;
  remote: string;
  password: string;
}) {
  const base = ["-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=8", "-p", String(input.port), input.target, input.remote];
  if (!input.password) {
    return {
      command: input.ssh,
      args: ["-o", "BatchMode=yes", "-o", "NumberOfPasswordPrompts=0", ...base],
      env: process.env,
      cleanup: async () => {},
    };
  }
  const dir = await mkdtemp(join(tmpdir(), "hv-ask-"));
  const ask = join(dir, "ask.sh");
  await writeFile(ask, "#!/bin/sh\nprintf '%s\\n' \"$HV_ASK_PASSWORD\"\n", { mode: 0o700 });
  await chmod(ask, 0o700);
  return {
    command: input.ssh,
    args: ["-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1", ...base],
    env: {
      ...process.env,
      SSH_ASKPASS: ask,
      SSH_ASKPASS_REQUIRE: "force",
      DISPLAY: process.env.DISPLAY || "none",
      HV_ASK_PASSWORD: input.password,
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
