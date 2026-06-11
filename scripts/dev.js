import { spawn } from "node:child_process";

const commands = [
  {
    name: "api",
    command: "node",
    args: ["./scripts/serve.js", "4174"],
  },
  {
    name: "vite",
    command: "npx",
    args: ["vite", "--host", "127.0.0.1"],
  },
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[${name}] exited with code ${code ?? "unknown"}`);
    shutdown(code ?? 1);
  });

  return child;
});

let shuttingDown = false;

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}
