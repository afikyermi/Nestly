// Runs the server and the web app together for local development.
import { spawn } from 'node:child_process';

const workspaces = ['@nestly/server', '@nestly/web'];

const children = workspaces.map((name) =>
  spawn('npm', ['run', 'dev', '-w', name], { stdio: 'inherit', shell: true }),
);

const stop = () => {
  for (const child of children) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
