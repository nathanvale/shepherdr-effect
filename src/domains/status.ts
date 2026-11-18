import { status } from "./result.ts";
export function inspectStatus() {
  return status("example.status", { ready: true }, "Starter is ready.");
}
