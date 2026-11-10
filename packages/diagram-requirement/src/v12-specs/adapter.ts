/**
 * Test-only adapter for the ported v12 requirement spec (R-TEST-3): v12's `setConfig`, its
 * `RequirementDB` and its `requirementDiagram.jison` parser, backed by the v13 parse. The spec's
 * expectations are kept as v12 wrote them; this file only translates names and shapes:
 *
 * - `reqDiagram.parser.parse(text)` throws on an error diagnostic, as v12's jison threw on a
 *   syntax error, else hands the model to `reqDiagram.parser.yy`;
 * - `RequirementDB` reads the model back as v12's DB held it: the requirement and element maps
 *   (`requirementId`, `text`, `risk`, `verifyMethod`, `type`, `docRef`, `cssStyles`,
 *   `classes`), the relations, the classes map, the direction and the acc values, plus v12's
 *   display tables (`RequirementType`, `RiskLevel`, `VerifyType`, `Relationships`) that the spec
 *   writes its sources with;
 * - `setConfig` does nothing: the parse reads no config.
 */
import { parseRequirement } from '../parser/index.ts';
import type { RequirementModel } from '../model.ts';

interface Box {
  name: string;
  type: string;
  requirementId?: string;
  text?: string;
  risk?: string;
  verifyMethod?: string;
  docRef?: string;
  cssStyles: string[];
  classes: string[];
}

export class RequirementDB {
  model: RequirementModel | undefined;

  readonly RequirementType = {
    REQUIREMENT: 'Requirement',
    FUNCTIONAL_REQUIREMENT: 'Functional Requirement',
    INTERFACE_REQUIREMENT: 'Interface Requirement',
    PERFORMANCE_REQUIREMENT: 'Performance Requirement',
    PHYSICAL_REQUIREMENT: 'Physical Requirement',
    DESIGN_CONSTRAINT: 'Design Constraint',
  };

  readonly RiskLevel = { LOW_RISK: 'Low', MED_RISK: 'Medium', HIGH_RISK: 'High' };

  readonly VerifyType = {
    VERIFY_ANALYSIS: 'Analysis',
    VERIFY_DEMONSTRATION: 'Demonstration',
    VERIFY_INSPECTION: 'Inspection',
    VERIFY_TEST: 'Test',
  };

  readonly Relationships = {
    CONTAINS: 'contains',
    COPIES: 'copies',
    DERIVES: 'derives',
    SATISFIES: 'satisfies',
    VERIFIES: 'verifies',
    REFINES: 'refines',
    TRACES: 'traces',
  };

  clear(): void {
    this.model = undefined;
  }

  getRequirements(): Map<string, Box> {
    return new Map(
      (this.model?.requirements ?? []).map((r) => [
        r.name,
        {
          name: r.name,
          type: r.kind,
          requirementId: r.requirementId,
          text: r.text,
          risk: r.risk,
          verifyMethod: r.verifyMethod,
          cssStyles: [...r.styles],
          classes: [...r.classes],
        },
      ])
    );
  }

  getElements(): Map<string, Box> {
    return new Map(
      (this.model?.elements ?? []).map((e) => [
        e.name,
        {
          name: e.name,
          type: e.type,
          docRef: e.docRef,
          cssStyles: [...e.styles],
          classes: [...e.classes],
        },
      ])
    );
  }

  getRelationships(): { type: string; src: string; dst: string }[] {
    return (this.model?.relations ?? []).map((r) => ({ type: r.kind, src: r.src, dst: r.dst }));
  }

  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }> {
    return new Map(
      (this.model?.classes ?? []).map((c) => [
        c.name,
        { id: c.name, styles: [...c.styles], textStyles: [...c.textStyles] },
      ])
    );
  }

  getDirection(): string {
    return this.model?.direction ?? 'TB';
  }

  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }

  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }
}

export const reqDiagram = {
  parser: {
    yy: undefined as RequirementDB | undefined,
    parse(text: string): void {
      const result = parseRequirement(text);
      const error = result.diagnostics.find((d) => d.severity === 'error');
      if (error) throw new Error(error.message);
      if (this.yy) this.yy.model = result.model;
    },
  },
};

/** v12's `setConfig`: the v13 parse reads no config. */
export const setConfig = (_config: unknown): undefined => undefined;
