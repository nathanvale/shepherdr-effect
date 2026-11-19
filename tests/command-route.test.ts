import { expect, test } from "bun:test";
import {
  type CommandDefinition,
  selectCommand,
} from "../src/commands-contract.ts";

function command(
  route: readonly string[],
  argumentUsage?: string,
): CommandDefinition {
  return {
    ...(argumentUsage === undefined ? {} : { argumentUsage }),
    commandIdentity: `example.${route.join(".")}`,
    effectClass: "inspect",
    route,
    summary: "An example command.",
    execute: () => Promise.reject(new Error("An example command never runs.")),
    stations: () => [],
  };
}

const list = command(["state", "list"]);
const check = command(["state", "check"], "--dir PATH");
const commands = [list, check];

test("a command without an argument usage is selected by its exact route and takes no arguments", () => {
  expect(selectCommand(commands, ["state", "list"])).toBe(list);
  expect(selectCommand(commands, ["state", "list", "extra"])).toBeUndefined();
});

test("a command with an argument usage is selected with or without words after its route", () => {
  expect(selectCommand(commands, ["state", "check"])).toBe(check);
  expect(
    selectCommand(commands, ["state", "check", "--dir", "somewhere"]),
  ).toBe(check);
});

test("no command is selected by part of a route or by another route", () => {
  expect(selectCommand(commands, ["state"])).toBeUndefined();
  expect(selectCommand(commands, ["inventory", "check"])).toBeUndefined();
  expect(selectCommand(commands, [])).toBeUndefined();
});
