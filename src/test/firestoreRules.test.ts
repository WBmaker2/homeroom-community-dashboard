import rulesSource from "../../firestore.rules?raw";
import { describe, expect, it } from "vitest";

describe("firestore cloud activity rules", () => {
  it("keeps existing owner on update while allowing create and update validations", () => {
    expect(rulesSource).toContain("allow create: if isHomeroomActivityWrite(code) && request.resource.data.teacherUid == request.auth.uid;");
    expect(rulesSource).toContain(
      "allow update: if isHomeroomActivityWrite(code)",
    );
    expect(rulesSource).toContain(
      "&& request.resource.data.teacherUid == resource.data.teacherUid",
    );
    expect(rulesSource).toContain(
      "&& request.resource.data.teacherUid == request.auth.uid;",
    );
  });

  it("validates cloud activity payload fields before mutating documents", () => {
    expect(rulesSource).toContain("request.resource.data.teacherUid is string");
    expect(rulesSource).toContain("request.resource.data.teacherId is string");
    expect(rulesSource).toContain("request.resource.data.classId is string");
    expect(rulesSource).toContain("request.resource.data.activityId is string");
    expect(rulesSource).toContain("request.resource.data.payload is string");
  });
});
