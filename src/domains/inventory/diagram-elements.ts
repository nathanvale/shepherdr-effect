import { Schema } from "effect";
import { byId, itemFields, place, type SourceFile } from "./source.ts";

/** `id` is a box's own id, or `from->to` for an arrow, with `#` and a number when two boxes have more than one. */
export const DiagramElement = Schema.Struct({
  ...itemFields("diagram-element"),
  element: Schema.Literals(["box", "arrow"]),
  label: Schema.String,
});
export type DiagramElement = (typeof DiagramElement)["Type"];

const LINE =
  /^\s*(Person|System_Ext|Container|ContainerDb|ContainerDb_Ext|Rel)\((.*)\)\s*$/;
// An argument is a quoted text, which may hold commas, or a bare word.
const ARGUMENT = /"((?:[^"\\]|\\.)*)"|([^,\s][^,]*)/g;

interface Shape {
  readonly element: "box" | "arrow";
  readonly id: string;
  readonly label: string;
  readonly line: number;
}

function shapeOf(text: string, line: number): Shape | undefined {
  const call = LINE.exec(text);
  if (call === null) return undefined;
  const values = [...(call[2] ?? "").matchAll(ARGUMENT)].map(
    (argument) => argument[1] ?? argument[2]?.trim() ?? "",
  );
  const [first = "", second = "", third = ""] = values;
  return call[1] === "Rel"
    ? { element: "arrow", id: `${first}->${second}`, label: third, line }
    : { element: "box", id: first, label: second, line };
}

/**
 * The boxes and arrows of a Mermaid C4 diagram. A boundary is a frame around
 * boxes, not a box, and a style line draws nothing: both are left out.
 */
export function diagramElements(file: SourceFile): DiagramElement[] {
  const shapes = file.text
    .split("\n")
    .flatMap((text, index) => shapeOf(text, index + 1) ?? []);
  const seen = new Map<string, number>();
  const repeated = (id: string) =>
    shapes.filter((shape) => shape.id === id).length > 1;
  return byId(
    shapes.map(({ element, id, label, line }) => {
      const nth = (seen.get(id) ?? 0) + 1;
      seen.set(id, nth);
      return {
        id: repeated(id) ? `${id}#${String(nth)}` : id,
        kind: "diagram-element" as const,
        source: place(file.path, line),
        element,
        label,
      };
    }),
  );
}
