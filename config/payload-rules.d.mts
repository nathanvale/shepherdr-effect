import type { Rule } from "eslint";

declare const payloadRules: {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

export default payloadRules;
