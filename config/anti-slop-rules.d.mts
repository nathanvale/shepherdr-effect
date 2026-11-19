import type { Rule } from "eslint";

declare const antiSlopRules: {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

export default antiSlopRules;
