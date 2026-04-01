import { describe, it, expect } from "vitest";
import { generateDesignDoc } from "../lib/project-design.js";
import type { ProjectWizardAnswers } from "../lib/wizard.js";

function makeAnswers(overrides: Partial<ProjectWizardAnswers> = {}): ProjectWizardAnswers {
  return {
    testingRigor: "standard",
    codeChangeStyle: "balanced",
    securityPosture: "standard",
    systemType: "api",
    language: "javascript",
    framework: "express",
    persistence: "sql",
    projectName: "my-api",
    projectDescription: "A test API service",
    ...overrides,
  };
}

describe("generateDesignDoc", () => {
  it("returns filePath as DESIGN.md", () => {
    const result = generateDesignDoc(makeAnswers());
    expect(result.filePath).toBe("DESIGN.md");
  });

  it("includes project name as title", () => {
    const result = generateDesignDoc(makeAnswers({ projectName: "cool-app" }));
    expect(result.content).toContain("# cool-app");
  });

  it("includes project description", () => {
    const result = generateDesignDoc(makeAnswers({ projectDescription: "My description" }));
    expect(result.content).toContain("My description");
  });

  it("includes system overview section", () => {
    const result = generateDesignDoc(makeAnswers());
    expect(result.content).toContain("## System Overview");
    expect(result.content).toContain("**Type:** api");
    expect(result.content).toContain("**Language:** javascript");
    expect(result.content).toContain("**Framework:** express");
  });

  it("includes architecture section for API", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "api" }));
    expect(result.content).toContain("## Architecture");
    expect(result.content).toContain("HTTP/transport layer");
    expect(result.content).toContain("Service layer");
  });

  it("includes architecture section for CLI", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "cli", framework: null }));
    expect(result.content).toContain("Argument parser");
    expect(result.content).toContain("Command handlers");
  });

  it("includes architecture section for library", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "library", framework: null }));
    expect(result.content).toContain("Public API surface");
    expect(result.content).toContain("Type definitions");
  });

  it("includes architecture section for web-app", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "web-app" }));
    expect(result.content).toContain("Client layer");
    expect(result.content).toContain("Business logic");
  });

  it("includes architecture section for fullstack", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "fullstack" }));
    expect(result.content).toContain("Frontend");
    expect(result.content).toContain("Backend API");
  });

  it("includes data flow section", () => {
    const result = generateDesignDoc(makeAnswers());
    expect(result.content).toContain("## Data Flow");
  });

  it("includes repository layer when persistence is not none", () => {
    const result = generateDesignDoc(makeAnswers({ persistence: "sql" }));
    expect(result.content).toContain("Repository layer");
  });

  it("omits repository layer when persistence is none", () => {
    const result = generateDesignDoc(makeAnswers({ persistence: "none" }));
    expect(result.content).not.toContain("Repository layer");
  });

  it("includes key technical decisions table", () => {
    const result = generateDesignDoc(makeAnswers());
    expect(result.content).toContain("## Key Technical Decisions");
    expect(result.content).toContain("| Language | javascript |");
  });

  it("includes open questions section", () => {
    const result = generateDesignDoc(makeAnswers());
    expect(result.content).toContain("## Open Questions & Risks");
  });

  it("includes auth question for API", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "api" }));
    expect(result.content).toContain("Authentication/authorization");
  });

  it("includes schema design question for SQL", () => {
    const result = generateDesignDoc(makeAnswers({ persistence: "sql" }));
    expect(result.content).toContain("Database schema design");
  });

  it("includes versioning question for library", () => {
    const result = generateDesignDoc(makeAnswers({ systemType: "library", framework: null }));
    expect(result.content).toContain("Versioning strategy");
  });

  it("includes build milestones", () => {
    const result = generateDesignDoc(makeAnswers());
    expect(result.content).toContain("## Build Milestones");
    expect(result.content).toContain("M1: Foundation");
    expect(result.content).toContain("Ship");
  });

  it("includes persistence milestone when persistence is not none", () => {
    const result = generateDesignDoc(makeAnswers({ persistence: "sql" }));
    expect(result.content).toContain("M3: Persistence");
  });

  it("content is between 50 and 200 lines", () => {
    const result = generateDesignDoc(makeAnswers());
    const lineCount = result.content.split("\n").length;
    expect(lineCount).toBeGreaterThan(50);
    expect(lineCount).toBeLessThan(200);
  });
});
