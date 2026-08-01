import { describe, it, expect } from "vitest";
import { checkAstResult } from "../src/utils/structureValidator.js";

// Regression cover for a bug a tester hit as "Ch8 L65 Inheritance is unpassable":
// the inheritance check compared `bases.includes(parent)` where `parent` was the
// ARRAY from the documented `inh: {Child: [Parent]}` form, so it was never true.
// The message stringified ["Dog"] to Dog and therefore read as if it were right,
// which is what made it so hard to diagnose from the UI.

// What the Python ast harness reports for:
//   class Dog: pass
//   class Puppy(Dog): pass
const puppyExtendsDog = {
  classes: ["Dog", "Puppy"],
  functions: [],
  classMethods: {},
  inheritance: { Puppy: ["Dog"] },
  usedNames: [],
};

describe("inheritance checks", () => {
  it("accepts the documented array form inh: {Child: [Parent]}", () => {
    expect(checkAstResult(puppyExtendsDog, { inheritance: { Puppy: ["Dog"] } })).toEqual({ valid: true });
  });

  it("still accepts a bare string parent", () => {
    expect(checkAstResult(puppyExtendsDog, { inheritance: { Puppy: "Dog" } })).toEqual({ valid: true });
  });

  it("rejects a class that really does not inherit, naming the missing parent", () => {
    const res = checkAstResult(puppyExtendsDog, { inheritance: { Puppy: ["Animal"] } });
    expect(res.valid).toBe(false);
    expect(res.error).toBe('Class "Puppy" does not inherit from "Animal".');
  });

  it("rejects a class that is absent entirely", () => {
    const res = checkAstResult(puppyExtendsDog, { inheritance: { Kitten: ["Cat"] } });
    expect(res.valid).toBe(false);
    expect(res.error).toBe('Class "Kitten" does not inherit from "Cat".');
  });

  it("requires every parent when several are listed", () => {
    const multi = { ...puppyExtendsDog, inheritance: { Hybrid: ["A", "B"] } };
    expect(checkAstResult(multi, { inheritance: { Hybrid: ["A", "B"] } })).toEqual({ valid: true });
    const res = checkAstResult(multi, { inheritance: { Hybrid: ["A", "C"] } });
    expect(res.valid).toBe(false);
    expect(res.error).toBe('Class "Hybrid" does not inherit from "C".');
  });
});

describe("other AST checks still behave", () => {
  const sample = {
    classes: ["Dog"],
    functions: ["greet"],
    classMethods: { Dog: ["bark"] },
    inheritance: {},
    usedNames: ["sorted"],
  };

  it("passes when nothing is required", () => {
    expect(checkAstResult(sample, {})).toEqual({ valid: true });
  });

  it("reports a missing class and a missing function", () => {
    expect(checkAstResult(sample, { classes: ["Cat"] }).error).toBe('Class "Cat" not found in your code.');
    expect(checkAstResult(sample, { functions: ["missing"] }).error).toBe('Function "missing" not found in your code.');
  });

  it("explains when a required function is actually a method", () => {
    expect(checkAstResult(sample, { functions: ["bark"] }).error).toContain('is a method of class "Dog"');
  });

  it("finds missing methods and banned names", () => {
    expect(checkAstResult(sample, { methods: { Dog: ["fetch"] } }).error).toBe('Method "fetch" not found in class "Dog".');
    expect(checkAstResult(sample, { not: ["sorted"] }).error).toBe('This level does not allow using "sorted".');
    expect(checkAstResult(sample, { not: "sorted" }).valid).toBe(false);
  });
});
