import { unchangedSuccess } from "../command-result.ts";
export function inspectStatus() {
  return unchangedSuccess(
    "shepherdr.status",
    { ready: true },
    "Starter is ready.",
  );
}
