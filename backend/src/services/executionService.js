import { spawn } from "child_process";
import { MAX_OUTPUT_BYTES } from "../config/constants.js";

function truncateOutput(output) {
  const buf = Buffer.from(output, "utf-8");
  if (buf.length <= MAX_OUTPUT_BYTES) {
    return output;
  }
  const truncated = buf.subarray(0, MAX_OUTPUT_BYTES).toString("utf-8");
  return truncated + `\n... [truncated, output exceeded ${MAX_OUTPUT_BYTES} bytes]`;
}

export function executeCommand(command, isShell, timeoutSeconds) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    const startTimePerf = performance.now();
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timedOut = false;
    let killed = false;

    let child;
    const spawnOptions = {
      shell: isShell,
      windowsHide: true,
    };

    if (isShell) {
      // For shell execution, command is a single string inside the array
      child = spawn(command[0], [], spawnOptions);
    } else {
      // For direct execution, command[0] is binary, slice(1) are arguments
      child = spawn(command[0], command.slice(1), spawnOptions);
    }

    let timeoutTimer = null;
    if (timeoutSeconds && timeoutSeconds > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        killed = true;
        child.kill("SIGKILL");
      }, timeoutSeconds * 1000);
    }

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf-8");
      // Truncate memory consumption early if needed
      if (stdoutBuffer.length > MAX_OUTPUT_BYTES + 1000) {
        stdoutBuffer = stdoutBuffer.substring(0, MAX_OUTPUT_BYTES + 1000);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString("utf-8");
      if (stderrBuffer.length > MAX_OUTPUT_BYTES + 1000) {
        stderrBuffer = stderrBuffer.substring(0, MAX_OUTPUT_BYTES + 1000);
      }
    });

    child.on("error", (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - startTimePerf);

      let errorMsg = `process error: ${err.message}`;
      if (err.code === "ENOENT") {
        errorMsg = `command not found: ${command[0]}`;
      }

      resolve({
        success: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: errorMsg,
        startedAt,
        finishedAt,
        durationMs,
        timedOut: false,
      });
    });

    child.on("exit", (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - startTimePerf);

      if (timedOut) {
        resolve({
          success: false,
          exitCode: null,
          stdout: truncateOutput(stdoutBuffer),
          stderr: truncateOutput(stderrBuffer),
          error: `command timed out after ${timeoutSeconds}s`,
          startedAt,
          finishedAt,
          durationMs,
          timedOut: true,
        });
        return;
      }

      const success = code === 0 && !signal;
      let error = null;
      if (!success) {
        error = signal ? `killed by signal ${signal}` : `exit code ${code}`;
      }

      resolve({
        success,
        exitCode: code,
        stdout: truncateOutput(stdoutBuffer),
        stderr: truncateOutput(stderrBuffer),
        error,
        startedAt,
        finishedAt,
        durationMs,
        timedOut: false,
      });
    });
  });
}
