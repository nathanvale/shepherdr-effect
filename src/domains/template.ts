import { unchangedSuccess } from "../command-result.ts";
export function inspectTemplate() {
  return unchangedSuccess(
    "example.template.info",
    { contractVersion: "2.0.0" },
    "Contract Core 2.0.0.",
  );
}
