import { status } from "./result.ts";
export function inspectTemplate() {
  return status(
    "example.template.info",
    { contractVersion: "2.0.0" },
    "Contract Core 2.0.0.",
  );
}
