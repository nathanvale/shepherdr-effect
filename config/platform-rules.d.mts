import type { Rule } from "eslint";

declare const platformRules: {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

export default platformRules;
