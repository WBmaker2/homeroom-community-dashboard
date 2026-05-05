import rulesSource from "../../firestore.rules?raw";
import { describe, expect, it } from "vitest";

function normalizeRules(source: string): string {
  return source
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expectToContainRule(source: string, ruleSnippet: string) {
  const normalizedSource = normalizeRules(source);
  const normalizedSnippet = normalizeRules(ruleSnippet);

  expect(normalizedSource).toContain(normalizedSnippet);
}

describe("firestore cloud activity rules", () => {
  it("reads both legacy and owner-aware schemas for public activity documents", () => {
    expectToContainRule(
      rulesSource,
      'return data.app == "homeroom-community-dashboard" && data.schemaVersion == 1',
    );
    expectToContainRule(
      rulesSource,
      'return data.app == "homeroom-community-dashboard" && data.schemaVersion == 2',
    );
    expectToContainRule(
      rulesSource,
      "return isLegacyHomeroomActivity(data) || isOwnerAwareHomeroomActivity(data)",
    );
    expectToContainRule(rulesSource, "allow read: if isExistingHomeroomActivity();");
  });

  it("requires authenticated owner-aware schema for cloud activity create/update/delete", () => {
    expectToContainRule(rulesSource, "allow create: if request.auth != null && isHomeroomActivityWrite(code);");
    expectToContainRule(
      rulesSource,
      "allow update: if request.auth != null && isHomeroomActivityWrite(code)",
    );
    expectToContainRule(rulesSource, "allow delete: if request.auth != null && isHomeroomActivityOwnerByResource();");
    expectToContainRule(rulesSource, "request.resource.data.teacherUid is string");
    expectToContainRule(rulesSource, "request.resource.data.teacherUid == request.auth.uid;");
    expect(rulesSource).toContain("request.resource.data.teacherId is string");
    expectToContainRule(rulesSource, "request.resource.data.classId is string");
    expectToContainRule(rulesSource, "request.resource.data.activityId is string");
    expectToContainRule(rulesSource, "request.resource.data.payload is string");
    expectToContainRule(
      rulesSource,
      "return isOwnerAwareHomeroomActivity(request.resource.data) && request.resource.data.code == code",
    );
  });

  it("keeps submission create public and restricts read/delete to parent owner", () => {
    expectToContainRule(rulesSource, "allow create: if isSubmissionCreate();");
    expectToContainRule(
      rulesSource,
      "allow read: if request.auth != null && isHomeroomActivityOwnerByCode(code);",
    );
    expectToContainRule(
      rulesSource,
      "allow delete: if request.auth != null && isHomeroomActivityOwnerByCode(code);",
    );
    expectToContainRule(rulesSource, "allow update: if false;");
  });
});
