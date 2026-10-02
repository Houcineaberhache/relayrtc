import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const environmentPath = new URL("../.env", import.meta.url);
const examplePath = new URL("../.env.example", import.meta.url);

if (!existsSync(environmentPath)) {
  const postgresPassword = randomBytes(24).toString("hex");
  const values = readFileSync(examplePath, "utf8")
    .replace("replace-with-a-random-password", postgresPassword)
    .replace(
      "postgresql://relaykit:replace-with-a-random-password@localhost:5433/relaykit",
      `postgresql://relaykit:${postgresPassword}@localhost:5433/relaykit`,
    )
    .replace(
      "PARTICIPANT_TOKEN_SIGNING_SECRET=replace-with-at-least-32-random-characters",
      `PARTICIPANT_TOKEN_SIGNING_SECRET=${randomBytes(32).toString("hex")}`,
    )
    .replace(
      "BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters",
      `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
    )
    .replace(
      "TURN_SHARED_SECRET=replace-with-at-least-32-random-characters",
      `TURN_SHARED_SECRET=${randomBytes(32).toString("hex")}`,
    )
    .replace("replace-with-a-random-password", randomBytes(24).toString("hex"));

  writeFileSync(environmentPath, values, { encoding: "utf8", mode: 0o600 });
  process.stdout.write("Created .env with generated local secrets.\n");
}

const docker = spawn(
  "docker",
  ["compose", "--env-file", ".env", "up", "--detach", "--build", "--wait", "--remove-orphans"],
  { cwd: new URL("..", import.meta.url), stdio: "inherit" },
);

docker.on("error", (error) => {
  process.stderr.write(`Unable to start Docker Compose: ${error.message}\n`);
  process.exitCode = 1;
});

docker.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
