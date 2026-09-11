import type { Rule } from "../types.js";
import { duplicateToolsRule } from "./core/duplicate-tools.js";
import { descriptionQualityRule } from "./core/description-quality.js";
import { missingInputSchemaRule } from "./core/missing-input-schema.js";
import { errorBoundaryRule } from "./core/error-boundary.js";
import { timeoutGuardRule } from "./core/timeout-guard.js";
import { unreferencedToolRule } from "./core/unreferenced-tool.js";
import { duplicateCallsRule } from "./runtime/duplicate-calls.js";
import { deadToolsRule } from "./runtime/dead-tools.js";
import { slowToolsRule } from "./runtime/slow-tools.js";
import { highFailureRateRule } from "./runtime/high-failure-rate.js";
import { sentryInitRule } from "./sentry/sentry-init.js";
import { sentryToolSpansRule } from "./sentry/sentry-tool-spans.js";
import { sentryErrorCaptureRule } from "./sentry/sentry-error-capture.js";
import { sentryBreadcrumbsRule } from "./sentry/sentry-breadcrumbs.js";

export class RuleRegistry {
  private rules: Map<string, Rule> = new Map();

  constructor() {
    this.registerBuiltinRules();
  }

  private registerBuiltinRules(): void {
    // Core structural rules
    this.register(duplicateToolsRule);
    this.register(descriptionQualityRule);
    this.register(missingInputSchemaRule);
    this.register(errorBoundaryRule);
    this.register(timeoutGuardRule);
    this.register(unreferencedToolRule);

    // Runtime behavioral rules
    this.register(duplicateCallsRule);
    this.register(deadToolsRule);
    this.register(slowToolsRule);
    this.register(highFailureRateRule);

    // Sentry integration pack rules
    this.register(sentryInitRule);
    this.register(sentryToolSpansRule);
    this.register(sentryErrorCaptureRule);
    this.register(sentryBreadcrumbsRule);
  }

  public register(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  public get(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  public getAll(): Rule[] {
    return Array.from(this.rules.values());
  }

  public getByCategory(category: string): Rule[] {
    return this.getAll().filter((r) => r.category === category);
  }
}

export const defaultRuleRegistry = new RuleRegistry();
