import type { ProjectWizardAnswers, SystemType, PersistenceType } from "./wizard.js";

export interface DesignDocResult {
  content: string;
  filePath: string;
}

/**
 * Architecture section templates per system type.
 */
function architectureSection(systemType: SystemType, persistence: PersistenceType): string {
  const lines: string[] = [];

  switch (systemType) {
    case "web-app":
      lines.push(
        "### Components",
        "",
        "- **Client layer** — Browser-rendered UI, page navigation",
        "- **Route/page handlers** — Request handling, SSR if applicable",
        "- **Business logic** — Core application rules and data processing",
      );
      if (persistence !== "none") {
        lines.push("- **Data access layer** — Database queries and mutations");
      }
      lines.push("- **External integrations** — Third-party APIs (placeholder)");
      break;

    case "fullstack":
      lines.push(
        "### Components",
        "",
        "- **Frontend** — Browser UI, client-side routing, state management",
        "- **Backend API** — HTTP endpoints serving the frontend",
        "- **Business logic** — Shared core rules and validation",
      );
      if (persistence !== "none") {
        lines.push("- **Data access layer** — Database queries and mutations");
      }
      lines.push("- **External integrations** — Third-party APIs (placeholder)");
      break;

    case "api":
      lines.push(
        "### Components",
        "",
        "- **HTTP/transport layer** — Server setup, middleware chain",
        "- **Route handlers / controllers** — Request parsing, response formatting",
        "- **Service layer** — Business logic, orchestration",
      );
      if (persistence !== "none") {
        lines.push("- **Repository layer** — Data access, queries, mutations");
      }
      lines.push("- **Middleware** — Auth, logging, error handling, rate limiting");
      break;

    case "cli":
      lines.push(
        "### Components",
        "",
        "- **Argument parser / command registry** — CLI interface, flag parsing",
        "- **Command handlers** — Per-command logic",
        "- **Core logic** — Reusable business logic decoupled from CLI",
        "- **Output formatting** — Structured output (table, JSON, plain text)",
      );
      break;

    case "library":
      lines.push(
        "### Components",
        "",
        "- **Public API surface** — Exported functions, classes, types",
        "- **Internal implementation** — Private helpers, algorithms",
        "- **Type definitions / interfaces** — Public contracts and type safety",
      );
      break;
  }

  return lines.join("\n");
}

/**
 * Data flow section adapted to system type and persistence.
 */
function dataFlowSection(systemType: SystemType, persistence: PersistenceType): string {
  const lines: string[] = ["## Data Flow", ""];

  switch (systemType) {
    case "web-app":
    case "fullstack":
      if (persistence !== "none") {
        lines.push(
          "```",
          "Browser → Request → Router → Handler → Service → Repository → Database",
          "                                                       ↓",
          "Browser ← Response ← Handler ← Service ← Repository ← Database",
          "```",
        );
      } else {
        lines.push(
          "```",
          "Browser → Request → Router → Handler → Service → Response → Browser",
          "```",
        );
      }
      break;

    case "api":
      if (persistence !== "none") {
        lines.push(
          "```",
          "Client → Request → Middleware → Handler → Service → Repository → Database",
          "                                                         ↓",
          "Client ← Response ← Handler ← Service ← Repository ← Database",
          "```",
        );
      } else {
        lines.push(
          "```",
          "Client → Request → Middleware → Handler → Service → Response → Client",
          "```",
        );
      }
      break;

    case "cli":
      lines.push(
        "```",
        "User input → Arg parser → Command handler → Core logic → Output formatter → stdout",
        "```",
      );
      break;

    case "library":
      lines.push(
        "```",
        "Consumer code → Public API → Internal implementation → Return value",
        "```",
      );
      break;
  }

  return lines.join("\n");
}

/**
 * Open questions populated based on what the wizard didn't cover.
 */
function openQuestionsSection(
  systemType: SystemType,
  persistence: PersistenceType
): string {
  const questions: string[] = [];

  if (systemType === "web-app" || systemType === "api" || systemType === "fullstack") {
    questions.push("- [ ] Authentication/authorization approach");
    questions.push("- [ ] Error response format and status code conventions");
  }

  questions.push("- [ ] Deployment target (local dev first, deploy later)");
  questions.push("- [ ] Monitoring and observability strategy");

  if (persistence === "sql") {
    questions.push("- [ ] Database schema design");
    questions.push("- [ ] Migration strategy and tooling");
  } else if (persistence === "nosql") {
    questions.push("- [ ] Data model design (document structure, key patterns)");
  }

  if (systemType === "library") {
    questions.push("- [ ] Package registry and publishing workflow");
    questions.push("- [ ] Versioning strategy (semver)");
    questions.push("- [ ] API stability guarantees");
  }

  if (systemType === "cli") {
    questions.push("- [ ] Distribution method (binary release, package manager)");
    questions.push("- [ ] Shell completion support");
  }

  if (systemType === "fullstack") {
    questions.push("- [ ] Frontend/backend communication contract (REST, GraphQL, tRPC)");
  }

  return ["## Open Questions & Risks", "", ...questions].join("\n");
}

/**
 * Generate DESIGN.md content from project wizard answers.
 */
export function generateDesignDoc(answers: ProjectWizardAnswers): DesignDocResult {
  const frameworkDisplay = answers.framework || "None";
  const persistenceDisplay = answers.persistence === "none" ? "None" : answers.persistence.toUpperCase();

  const lines: string[] = [];

  // Title and description
  lines.push(`# ${answers.projectName}`);
  lines.push("");
  if (answers.projectDescription) {
    lines.push(answers.projectDescription);
    lines.push("");
  }

  // System overview
  lines.push("## System Overview");
  lines.push("");
  lines.push(`**Type:** ${answers.systemType}`);
  lines.push(`**Language:** ${answers.language}`);
  lines.push(`**Framework:** ${frameworkDisplay}`);
  lines.push(`**Persistence:** ${persistenceDisplay}`);
  lines.push("");

  // Architecture
  lines.push("## Architecture");
  lines.push("");
  lines.push(architectureSection(answers.systemType, answers.persistence));
  lines.push("");

  // Data flow
  lines.push(dataFlowSection(answers.systemType, answers.persistence));
  lines.push("");

  // Key technical decisions
  lines.push("## Key Technical Decisions");
  lines.push("");
  lines.push("| Decision | Choice | Rationale |");
  lines.push("|----------|--------|-----------|");
  lines.push(`| Language | ${answers.language} | User selected |`);
  if (answers.framework) {
    lines.push(`| Framework | ${answers.framework} | ${frameworkRationale(answers)} |`);
  }
  if (answers.persistence !== "none") {
    lines.push(`| Persistence | ${answers.persistence} | ${persistenceRationale(answers)} |`);
  }
  lines.push(`| Testing | ${answers.testingRigor} | ${testingRationale(answers.testingRigor)} |`);
  lines.push("");

  // Constraints
  lines.push("## Constraints");
  lines.push("");
  if (answers.securityPosture === "strict") {
    lines.push("- Strict security: restricted file access, no network tools without approval");
  }
  if (answers.testingRigor === "strict") {
    lines.push("- All new code must have tests before merging");
  }
  lines.push("- No external service dependencies in v1 (mock external calls)");
  lines.push("- Focus on core functionality before optimization");
  lines.push("");

  // Open questions
  lines.push(openQuestionsSection(answers.systemType, answers.persistence));
  lines.push("");

  // Build milestones
  lines.push("## Build Milestones");
  lines.push("");
  lines.push("1. **M1: Foundation** — Project structure, dev tooling, CI (if needed). Entry point runs.");
  lines.push("2. **M2: Core Logic** — Primary feature implemented end-to-end.");
  if (answers.persistence !== "none") {
    lines.push("3. **M3: Persistence** — Data layer connected and tested.");
  }
  lines.push(`${answers.persistence !== "none" ? "4" : "3"}. **M${answers.persistence !== "none" ? "4" : "3"}: Polish** — Error handling, edge cases, documentation.`);
  lines.push(`${answers.persistence !== "none" ? "5" : "4"}. **M${answers.persistence !== "none" ? "5" : "4"}: Ship** — README, packaging, first release.`);
  lines.push("");

  return {
    content: lines.join("\n"),
    filePath: "DESIGN.md",
  };
}

function frameworkRationale(answers: ProjectWizardAnswers): string {
  const fw = answers.framework;
  if (!fw) return "No framework selected";

  const rationales: Record<string, string> = {
    next: "SSR + file-based routing for fast iteration",
    react: "Component-based UI with rich ecosystem",
    vue: "Progressive framework, easy to adopt incrementally",
    express: "Widely adopted, large middleware ecosystem",
    fastify: "Performance-focused with schema validation",
    hono: "Ultrafast, works across runtimes",
    fastapi: "Type-safe, auto-generated API docs",
    django: "Batteries-included with ORM and admin",
    flask: "Lightweight, flexible, minimal boilerplate",
    gin: "High performance with middleware support",
    echo: "Minimalist with good documentation",
    chi: "Idiomatic Go, composable middleware",
    "net-http": "Zero dependencies, standard library only",
    rails: "Convention over configuration, rapid development",
    sinatra: "Minimal DSL for quick HTTP services",
    actix: "Best-in-class Rust web performance",
    axum: "Ergonomic, built on tokio and tower",
  };

  return rationales[fw] ?? "User selected";
}

function persistenceRationale(answers: ProjectWizardAnswers): string {
  switch (answers.persistence) {
    case "sql":
      return "Structured data with relational queries";
    case "nosql":
      return "Flexible schema, horizontal scaling";
    case "file-based":
      return "Simple persistence, no external dependencies";
    default:
      return "No persistence needed";
  }
}

function testingRationale(rigor: string): string {
  switch (rigor) {
    case "strict":
      return "High confidence required, all code tested";
    case "standard":
      return "Balance of speed and confidence";
    case "minimal":
      return "Fast iteration, test critical paths only";
    default:
      return "User selected";
  }
}
