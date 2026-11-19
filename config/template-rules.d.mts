import type { Rule } from "eslint";

declare const templateRules: {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

export default templateRules;
