import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ProjectWizardAnswers } from "./wizard.js";
import type { OverlayName } from "./detect.js";

export interface ScaffoldResult {
  filesWritten: string[];
}

function writeFile(repoRoot: string, relPath: string, content: string, files: string[]): void {
  const fullPath = join(repoRoot, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
  files.push(relPath);
}

function mkDir(repoRoot: string, relPath: string): void {
  mkdirSync(join(repoRoot, relPath), { recursive: true });
}

// ---------------------------------------------------------------------------
// JavaScript/TypeScript scaffold
// ---------------------------------------------------------------------------

function scaffoldJavaScript(repoRoot: string, answers: ProjectWizardAnswers, files: string[]): void {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {
    typescript: "^5.0.0",
    vitest: "^2.0.0",
    "@biomejs/biome": "^1.0.0",
  };
  const scripts: Record<string, string> = {
    test: "vitest run",
    lint: "biome check .",
    "lint:fix": "biome check --write .",
  };

  // Framework-specific deps and scripts
  if (answers.framework === "next") {
    deps["next"] = "^15.0.0";
    deps["react"] = "^19.0.0";
    deps["react-dom"] = "^19.0.0";
    devDeps["@types/react"] = "^19.0.0";
    scripts["dev"] = "next dev";
    scripts["build"] = "next build";
    scripts["start"] = "next start";
  } else if (answers.framework === "react") {
    deps["react"] = "^19.0.0";
    deps["react-dom"] = "^19.0.0";
    devDeps["@types/react"] = "^19.0.0";
    scripts["dev"] = "vite";
    scripts["build"] = "vite build";
  } else if (answers.framework === "vue") {
    deps["vue"] = "^3.0.0";
    scripts["dev"] = "vite";
    scripts["build"] = "vite build";
  } else if (answers.framework === "express") {
    deps["express"] = "^5.0.0";
    devDeps["@types/express"] = "^5.0.0";
    scripts["dev"] = "tsx watch src/index.ts";
    scripts["build"] = "tsc";
    scripts["start"] = "node dist/index.js";
  } else if (answers.framework === "fastify") {
    deps["fastify"] = "^5.0.0";
    scripts["dev"] = "tsx watch src/index.ts";
    scripts["build"] = "tsc";
    scripts["start"] = "node dist/index.js";
  } else if (answers.framework === "hono") {
    deps["hono"] = "^4.0.0";
    scripts["dev"] = "tsx watch src/index.ts";
    scripts["build"] = "tsc";
    scripts["start"] = "node dist/index.js";
  } else {
    scripts["dev"] = "tsx watch src/index.ts";
    scripts["build"] = "tsc";
    scripts["start"] = "node dist/index.js";
  }

  // Persistence deps
  if (answers.persistence === "sql") {
    deps["prisma"] = "^6.0.0";
    deps["@prisma/client"] = "^6.0.0";
  } else if (answers.persistence === "nosql") {
    deps["redis"] = "^4.0.0";
  }

  // package.json
  const pkg = {
    name: answers.projectName,
    version: "0.1.0",
    description: answers.projectDescription,
    type: "module",
    scripts,
    dependencies: Object.keys(deps).length > 0 ? deps : undefined,
    devDependencies: devDeps,
  };
  writeFile(repoRoot, "package.json", JSON.stringify(pkg, null, 2) + "\n", files);

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ES2022",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
      declaration: true,
    },
    include: ["src"],
  };
  writeFile(repoRoot, "tsconfig.json", JSON.stringify(tsconfig, null, 2) + "\n", files);

  // .gitignore
  writeFile(repoRoot, ".gitignore", [
    "node_modules/",
    "dist/",
    ".env",
    ".env.local",
    "",
  ].join("\n"), files);

  // Framework-specific files
  if (answers.framework === "next") {
    writeFile(repoRoot, "next.config.ts", [
      "import type { NextConfig } from 'next';",
      "",
      "const nextConfig: NextConfig = {};",
      "",
      "export default nextConfig;",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, "app/layout.tsx", [
      "export const metadata = {",
      `  title: '${answers.projectName}',`,
      `  description: '${answers.projectDescription}',`,
      "};",
      "",
      "export default function RootLayout({ children }: { children: React.ReactNode }) {",
      "  return (",
      "    <html lang=\"en\">",
      "      <body>{children}</body>",
      "    </html>",
      "  );",
      "}",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, "app/page.tsx", [
      "export default function Home() {",
      "  return (",
      "    <main>",
      `      <h1>${answers.projectName}</h1>`,
      `      <p>${answers.projectDescription}</p>`,
      "    </main>",
      "  );",
      "}",
      "",
    ].join("\n"), files);
  } else {
    // src/index.ts
    writeFile(repoRoot, "src/index.ts", generateJsEntryPoint(answers), files);

    if (answers.systemType === "api") {
      mkDir(repoRoot, "src/routes");
    }
  }

  // tests
  writeFile(repoRoot, "tests/index.test.ts", [
    'import { describe, it, expect } from "vitest";',
    "",
    `describe("${answers.projectName}", () => {`,
    '  it("should work", () => {',
    "    expect(true).toBe(true);",
    "  });",
    "});",
    "",
  ].join("\n"), files);

  // Persistence scaffolding
  if (answers.persistence === "sql") {
    mkDir(repoRoot, "prisma");
    writeFile(repoRoot, "prisma/schema.prisma", [
      "generator client {",
      '  provider = "prisma-client-js"',
      "}",
      "",
      "datasource db {",
      '  provider = "sqlite"',
      '  url      = env("DATABASE_URL")',
      "}",
      "",
      "// Add your models here",
      "",
    ].join("\n"), files);
  } else if (answers.persistence === "file-based") {
    mkDir(repoRoot, "data");
    writeFile(repoRoot, "data/.gitkeep", "", files);
  }
}

function generateJsEntryPoint(answers: ProjectWizardAnswers): string {
  if (answers.systemType === "api" || answers.systemType === "web-app" || answers.systemType === "fullstack") {
    if (answers.framework === "express") {
      return [
        'import express from "express";',
        "",
        "const app = express();",
        "const port = process.env.PORT || 3000;",
        "",
        "app.use(express.json());",
        "",
        'app.get("/health", (_req, res) => {',
        '  res.json({ status: "ok" });',
        "});",
        "",
        "app.listen(port, () => {",
        "  console.log(`Server running on port ${port}`);",
        "});",
        "",
      ].join("\n");
    }
    if (answers.framework === "fastify") {
      return [
        'import Fastify from "fastify";',
        "",
        "const app = Fastify({ logger: true });",
        "",
        'app.get("/health", async () => {',
        '  return { status: "ok" };',
        "});",
        "",
        "app.listen({ port: Number(process.env.PORT) || 3000 });",
        "",
      ].join("\n");
    }
    if (answers.framework === "hono") {
      return [
        'import { Hono } from "hono";',
        'import { serve } from "@hono/node-server";',
        "",
        "const app = new Hono();",
        "",
        'app.get("/health", (c) => c.json({ status: "ok" }));',
        "",
        "serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 });",
        "",
      ].join("\n");
    }
    // Default: raw HTTP
    return [
      'import { createServer } from "node:http";',
      "",
      "const server = createServer((req, res) => {",
      '  if (req.url === "/health") {',
      '    res.writeHead(200, { "Content-Type": "application/json" });',
      '    res.end(JSON.stringify({ status: "ok" }));',
      "    return;",
      "  }",
      "  res.writeHead(404);",
      '  res.end("Not found");',
      "});",
      "",
      "const port = Number(process.env.PORT) || 3000;",
      "server.listen(port, () => {",
      "  console.log(`Server running on port ${port}`);",
      "});",
      "",
    ].join("\n");
  }

  if (answers.systemType === "cli") {
    return [
      'import { parseArgs } from "node:util";',
      "",
      "const { values } = parseArgs({",
      "  options: {",
      '    help: { type: "boolean", short: "h" },',
      "  },",
      "});",
      "",
      "if (values.help) {",
      `  console.log("Usage: ${answers.projectName} [options]");`,
      "  process.exit(0);",
      "}",
      "",
      `console.log("Hello from ${answers.projectName}!");`,
      "",
    ].join("\n");
  }

  // Library
  return [
    `export function greet(name: string): string {`,
    `  return \`Hello, \${name}! Welcome to ${answers.projectName}.\`;`,
    "}",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Python scaffold
// ---------------------------------------------------------------------------

function scaffoldPython(repoRoot: string, answers: ProjectWizardAnswers, files: string[]): void {
  const deps: string[] = [];
  const devDeps: string[] = ["pytest>=8.0", "ruff>=0.5"];

  if (answers.framework === "fastapi") {
    deps.push("fastapi>=0.100", "uvicorn[standard]>=0.30");
  } else if (answers.framework === "flask") {
    deps.push("flask>=3.0");
  } else if (answers.framework === "django") {
    deps.push("django>=5.0");
  }

  if (answers.persistence === "sql") {
    deps.push("sqlalchemy>=2.0", "alembic>=1.13");
  } else if (answers.persistence === "nosql") {
    deps.push("redis>=5.0");
  }

  // pyproject.toml
  const pyproject = [
    "[build-system]",
    'requires = ["hatchling"]',
    'build-backend = "hatchling.build"',
    "",
    "[project]",
    `name = "${answers.projectName}"`,
    'version = "0.1.0"',
    `description = "${answers.projectDescription}"`,
    'requires-python = ">=3.11"',
  ];
  if (deps.length > 0) {
    pyproject.push(`dependencies = [${deps.map((d) => `"${d}"`).join(", ")}]`);
  } else {
    pyproject.push("dependencies = []");
  }
  pyproject.push(
    "",
    "[project.optional-dependencies]",
    `dev = [${devDeps.map((d) => `"${d}"`).join(", ")}]`,
    "",
    "[tool.ruff]",
    "line-length = 88",
    "",
  );
  writeFile(repoRoot, "pyproject.toml", pyproject.join("\n"), files);

  // Module structure
  const modName = answers.projectName.replace(/-/g, "_");

  writeFile(repoRoot, `src/${modName}/__init__.py`, `"""${answers.projectDescription}"""\n`, files);

  // Entry point varies by systemType + framework
  if (answers.framework === "fastapi") {
    writeFile(repoRoot, `src/${modName}/app.py`, [
      "from fastapi import FastAPI",
      "",
      "app = FastAPI()",
      "",
      "",
      '@app.get("/health")',
      "async def health():",
      '    return {"status": "ok"}',
      "",
    ].join("\n"), files);
  } else if (answers.framework === "django") {
    // Minimal Django scaffold (4 files)
    writeFile(repoRoot, `src/${modName}/settings.py`, [
      '"""Django settings."""',
      "",
      "from pathlib import Path",
      "",
      "BASE_DIR = Path(__file__).resolve().parent.parent",
      'SECRET_KEY = "change-me-in-production"',
      "DEBUG = True",
      "ALLOWED_HOSTS = []",
      `ROOT_URLCONF = "${modName}.urls"`,
      "INSTALLED_APPS = [",
      '    "django.contrib.contenttypes",',
      '    "django.contrib.auth",',
      "]",
      "DATABASES = {",
      '    "default": {',
      '        "ENGINE": "django.db.backends.sqlite3",',
      '        "NAME": BASE_DIR / "db.sqlite3",',
      "    }",
      "}",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, `src/${modName}/urls.py`, [
      "from django.http import JsonResponse",
      "from django.urls import path",
      "",
      "",
      "def health(request):",
      '    return JsonResponse({"status": "ok"})',
      "",
      "",
      "urlpatterns = [",
      '    path("health", health),',
      "]",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, `src/${modName}/wsgi.py`, [
      '"""WSGI config."""',
      "",
      "import os",
      "from django.core.wsgi import get_wsgi_application",
      "",
      `os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${modName}.settings")`,
      "application = get_wsgi_application()",
      "",
    ].join("\n"), files);

    // manage.py — NOTE: requires additional setup, see comment at top
    writeFile(repoRoot, "manage.py", [
      "#!/usr/bin/env python",
      '# NOTE: Run `pip install -e ".[dev]"` then `python manage.py migrate` to complete setup.',
      '"""Django management script."""',
      "",
      "import os",
      "import sys",
      "",
      "",
      "def main():",
      `    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${modName}.settings")`,
      "    from django.core.management import execute_from_command_line",
      "    execute_from_command_line(sys.argv)",
      "",
      "",
      'if __name__ == "__main__":',
      "    main()",
      "",
    ].join("\n"), files);
  } else if (answers.framework === "flask") {
    writeFile(repoRoot, `src/${modName}/app.py`, [
      "from flask import Flask, jsonify",
      "",
      "app = Flask(__name__)",
      "",
      "",
      '@app.route("/health")',
      "def health():",
      '    return jsonify(status="ok")',
      "",
    ].join("\n"), files);
  } else {
    writeFile(repoRoot, `src/${modName}/main.py`, generatePythonEntryPoint(answers, modName), files);
  }

  // Tests
  writeFile(repoRoot, "tests/__init__.py", "", files);
  writeFile(repoRoot, "tests/test_main.py", [
    `"""Tests for ${answers.projectName}."""`,
    "",
    "",
    "def test_placeholder():",
    "    assert True",
    "",
  ].join("\n"), files);

  // .gitignore
  writeFile(repoRoot, ".gitignore", [
    ".venv/",
    "__pycache__/",
    "*.pyc",
    ".env",
    "*.egg-info/",
    "dist/",
    "db.sqlite3",
    "",
  ].join("\n"), files);

  // Persistence scaffolding
  if (answers.persistence === "sql" && answers.framework !== "django") {
    mkDir(repoRoot, "migrations");
    writeFile(repoRoot, "migrations/.gitkeep", "", files);
  } else if (answers.persistence === "file-based") {
    mkDir(repoRoot, "data");
    writeFile(repoRoot, "data/.gitkeep", "", files);
  }
}

function generatePythonEntryPoint(answers: ProjectWizardAnswers, modName: string): string {
  if (answers.systemType === "cli") {
    return [
      "import argparse",
      "",
      "",
      "def main():",
      `    parser = argparse.ArgumentParser(description="${answers.projectDescription}")`,
      "    parser.parse_args()",
      `    print("Hello from ${answers.projectName}!")`,
      "",
      "",
      'if __name__ == "__main__":',
      "    main()",
      "",
    ].join("\n");
  }

  if (answers.systemType === "library") {
    return [
      `"""Core module for ${modName}."""`,
      "",
      "",
      "def greet(name: str) -> str:",
      `    return f"Hello, {name}! Welcome to ${answers.projectName}."`,
      "",
    ].join("\n");
  }

  // Default entry point
  return [
    `"""${answers.projectDescription}"""`,
    "",
    "",
    "def main():",
    `    print("Hello from ${answers.projectName}!")`,
    "",
    "",
    'if __name__ == "__main__":',
    "    main()",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Go scaffold
// ---------------------------------------------------------------------------

function scaffoldGo(repoRoot: string, answers: ProjectWizardAnswers, files: string[]): void {
  const modulePath = `example.com/${answers.projectName}`;

  // go.mod
  const goMod = [
    `module ${modulePath}`,
    "",
    "go 1.22",
    "",
  ];

  // Add framework dependencies
  if (answers.framework === "gin") {
    goMod.splice(3, 0, 'require github.com/gin-gonic/gin v1.10.0');
  } else if (answers.framework === "echo") {
    goMod.splice(3, 0, 'require github.com/labstack/echo/v4 v4.12.0');
  } else if (answers.framework === "chi") {
    goMod.splice(3, 0, 'require github.com/go-chi/chi/v5 v5.1.0');
  }

  if (answers.persistence === "sql") {
    goMod.splice(3, 0, 'require gorm.io/gorm v1.25.0');
  }

  writeFile(repoRoot, "go.mod", goMod.join("\n"), files);

  // .gitignore
  writeFile(repoRoot, ".gitignore", [
    `${answers.projectName}`,
    ".env",
    "",
  ].join("\n"), files);

  if (answers.systemType === "library") {
    writeFile(repoRoot, `${answers.projectName}.go`, [
      `package ${sanitizeGoPackageName(answers.projectName)}`,
      "",
      "// Greet returns a greeting for the given name.",
      "func Greet(name string) string {",
      `\treturn "Hello, " + name + "! Welcome to ${answers.projectName}."`,
      "}",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, `${answers.projectName}_test.go`, [
      `package ${sanitizeGoPackageName(answers.projectName)}`,
      "",
      'import "testing"',
      "",
      "func TestGreet(t *testing.T) {",
      '\tgot := Greet("World")',
      `\twant := "Hello, World! Welcome to ${answers.projectName}."`,
      "\tif got != want {",
      '\t\tt.Errorf("Greet() = %q, want %q", got, want)',
      "\t}",
      "}",
      "",
    ].join("\n"), files);
  } else if (answers.systemType === "cli") {
    mkDir(repoRoot, `cmd/${answers.projectName}`);
    writeFile(repoRoot, `cmd/${answers.projectName}/main.go`, [
      "package main",
      "",
      'import "fmt"',
      "",
      "func main() {",
      `\tfmt.Println("Hello from ${answers.projectName}!")`,
      "}",
      "",
    ].join("\n"), files);
    mkDir(repoRoot, "internal");
  } else {
    // API / web-app / fullstack
    writeFile(repoRoot, "main.go", generateGoServerEntryPoint(answers), files);
    mkDir(repoRoot, "internal");
    if (answers.framework) {
      mkDir(repoRoot, "internal/server");
    }
  }

  // Persistence
  if (answers.persistence === "sql") {
    mkDir(repoRoot, "migrations");
    writeFile(repoRoot, "migrations/.gitkeep", "", files);
  } else if (answers.persistence === "file-based") {
    mkDir(repoRoot, "data");
    writeFile(repoRoot, "data/.gitkeep", "", files);
  }
}

function sanitizeGoPackageName(name: string): string {
  return name.replace(/-/g, "");
}

function generateGoServerEntryPoint(answers: ProjectWizardAnswers): string {
  if (answers.framework === "gin") {
    return [
      "package main",
      "",
      'import "github.com/gin-gonic/gin"',
      "",
      "func main() {",
      "\tr := gin.Default()",
      '\tr.GET("/health", func(c *gin.Context) {',
      "\t\tc.JSON(200, gin.H{",
      '\t\t\t"status": "ok",',
      "\t\t})",
      "\t})",
      '\tr.Run(":3000")',
      "}",
      "",
    ].join("\n");
  }

  if (answers.framework === "echo") {
    return [
      "package main",
      "",
      "import (",
      '\t"net/http"',
      '\t"github.com/labstack/echo/v4"',
      ")",
      "",
      "func main() {",
      "\te := echo.New()",
      '\te.GET("/health", func(c echo.Context) error {',
      '\t\treturn c.JSON(http.StatusOK, map[string]string{"status": "ok"})',
      "\t})",
      '\te.Logger.Fatal(e.Start(":3000"))',
      "}",
      "",
    ].join("\n");
  }

  if (answers.framework === "chi") {
    return [
      "package main",
      "",
      "import (",
      '\t"encoding/json"',
      '\t"net/http"',
      '\t"github.com/go-chi/chi/v5"',
      ")",
      "",
      "func main() {",
      "\tr := chi.NewRouter()",
      '\tr.Get("/health", func(w http.ResponseWriter, r *http.Request) {',
      '\t\tw.Header().Set("Content-Type", "application/json")',
      '\t\tjson.NewEncoder(w).Encode(map[string]string{"status": "ok"})',
      "\t})",
      '\thttp.ListenAndServe(":3000", r)',
      "}",
      "",
    ].join("\n");
  }

  // net/http or no framework
  return [
    "package main",
    "",
    "import (",
    '\t"encoding/json"',
    '\t"fmt"',
    '\t"net/http"',
    ")",
    "",
    "func main() {",
    '\thttp.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {',
    '\t\tw.Header().Set("Content-Type", "application/json")',
    '\t\tjson.NewEncoder(w).Encode(map[string]string{"status": "ok"})',
    "\t})",
    "",
    '\tfmt.Println("Server running on :3000")',
    '\thttp.ListenAndServe(":3000", nil)',
    "}",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Rust scaffold
// ---------------------------------------------------------------------------

function scaffoldRust(repoRoot: string, answers: ProjectWizardAnswers, files: string[]): void {
  const cargoToml = [
    "[package]",
    `name = "${answers.projectName}"`,
    'version = "0.1.0"',
    'edition = "2021"',
    `description = "${answers.projectDescription}"`,
    "",
  ];

  const deps: string[] = [];
  if (answers.framework === "actix") {
    deps.push('actix-web = "4"');
    deps.push('serde = { version = "1", features = ["derive"] }');
    deps.push('serde_json = "1"');
  } else if (answers.framework === "axum") {
    deps.push('axum = "0.7"');
    deps.push('tokio = { version = "1", features = ["full"] }');
    deps.push('serde = { version = "1", features = ["derive"] }');
    deps.push('serde_json = "1"');
  }

  if (answers.persistence === "sql") {
    deps.push('diesel = { version = "2", features = ["sqlite"] }');
  }

  if (deps.length > 0) {
    cargoToml.push("[dependencies]");
    for (const dep of deps) {
      cargoToml.push(dep);
    }
    cargoToml.push("");
  }

  writeFile(repoRoot, "Cargo.toml", cargoToml.join("\n"), files);

  // .gitignore
  writeFile(repoRoot, ".gitignore", [
    "target/",
    ".env",
    "",
  ].join("\n"), files);

  if (answers.systemType === "library") {
    writeFile(repoRoot, "src/lib.rs", [
      `/// Greet someone by name.`,
      `pub fn greet(name: &str) -> String {`,
      `    format!("Hello, {}! Welcome to ${answers.projectName}.", name)`,
      "}",
      "",
      "#[cfg(test)]",
      "mod tests {",
      "    use super::*;",
      "",
      "    #[test]",
      "    fn test_greet() {",
      `        assert_eq!(greet("World"), "Hello, World! Welcome to ${answers.projectName}.");`,
      "    }",
      "}",
      "",
    ].join("\n"), files);
  } else {
    writeFile(repoRoot, "src/main.rs", generateRustEntryPoint(answers), files);
  }

  // Persistence
  if (answers.persistence === "sql") {
    mkDir(repoRoot, "migrations");
    writeFile(repoRoot, "migrations/.gitkeep", "", files);
  }
}

function generateRustEntryPoint(answers: ProjectWizardAnswers): string {
  if (answers.framework === "actix") {
    return [
      "use actix_web::{web, App, HttpServer, HttpResponse};",
      "use serde_json::json;",
      "",
      "async fn health() -> HttpResponse {",
      '    HttpResponse::Ok().json(json!({"status": "ok"}))',
      "}",
      "",
      "#[actix_web::main]",
      "async fn main() -> std::io::Result<()> {",
      '    println!("Server running on :3000");',
      "    HttpServer::new(|| {",
      "        App::new()",
      '            .route("/health", web::get().to(health))',
      "    })",
      '    .bind("0.0.0.0:3000")?',
      "    .run()",
      "    .await",
      "}",
      "",
    ].join("\n");
  }

  if (answers.framework === "axum") {
    return [
      "use axum::{routing::get, Json, Router};",
      "use serde_json::{json, Value};",
      "",
      "async fn health() -> Json<Value> {",
      '    Json(json!({"status": "ok"}))',
      "}",
      "",
      "#[tokio::main]",
      "async fn main() {",
      '    let app = Router::new().route("/health", get(health));',
      '    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();',
      '    println!("Server running on :3000");',
      "    axum::serve(listener, app).await.unwrap();",
      "}",
      "",
    ].join("\n");
  }

  if (answers.systemType === "cli") {
    return [
      "use std::env;",
      "",
      "fn main() {",
      "    let args: Vec<String> = env::args().collect();",
      "    if args.iter().any(|a| a == \"--help\" || a == \"-h\") {",
      `        println!("Usage: ${answers.projectName} [options]");`,
      "        return;",
      "    }",
      `    println!("Hello from ${answers.projectName}!");`,
      "}",
      "",
    ].join("\n");
  }

  // Default
  return [
    "fn main() {",
    `    println!("Hello from ${answers.projectName}!");`,
    "}",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Ruby scaffold
// ---------------------------------------------------------------------------

function scaffoldRuby(repoRoot: string, answers: ProjectWizardAnswers, files: string[]): void {
  const gems: string[] = [];

  if (answers.framework === "rails") {
    gems.push('gem "rails", "~> 8.0"');
  } else if (answers.framework === "sinatra") {
    gems.push('gem "sinatra", "~> 4.0"');
    gems.push('gem "puma", "~> 6.0"');
  }

  if (answers.persistence === "sql" && answers.framework !== "rails") {
    gems.push('gem "activerecord", "~> 8.0"');
    gems.push('gem "sqlite3"');
  } else if (answers.persistence === "nosql") {
    gems.push('gem "redis", "~> 5.0"');
  }

  // Gemfile
  const gemfile = [
    'source "https://rubygems.org"',
    "",
    'ruby ">= 3.2"',
    "",
    ...gems,
    "",
    "group :development, :test do",
    '  gem "rspec", "~> 3.0"',
    '  gem "rubocop", "~> 1.0"',
    "end",
    "",
  ];
  writeFile(repoRoot, "Gemfile", gemfile.join("\n"), files);

  // .gitignore
  writeFile(repoRoot, ".gitignore", [
    ".bundle/",
    "vendor/",
    ".env",
    "*.gem",
    "",
  ].join("\n"), files);

  const libName = answers.projectName.replace(/-/g, "_");

  if (answers.framework === "rails") {
    // Minimal Rails scaffold (5 files)
    // NOTE: requires `bundle install && rails new --skip` for full setup
    writeFile(repoRoot, "config.ru", [
      '# NOTE: Run `bundle install` then `rails server` to start.',
      '# For full Rails setup, run: `rails new . --skip --force`',
      'require_relative "config/application"',
      "run Rails.application",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, "Rakefile", [
      'require_relative "config/application"',
      "Rails.application.load_tasks",
      "",
    ].join("\n"), files);

    mkDir(repoRoot, "config");
    writeFile(repoRoot, "config/routes.rb", [
      "Rails.application.routes.draw do",
      '  get "health", to: proc { [200, { "Content-Type" => "application/json" }, [\'{"status":"ok"}\']] }',
      "end",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, "config/application.rb", [
      'require "rails"',
      'require "action_controller/railtie"',
      "",
      "module App",
      "  class Application < Rails::Application",
      '    config.load_defaults 8.0',
      "    config.api_only = true",
      "  end",
      "end",
      "",
    ].join("\n"), files);

    mkDir(repoRoot, "app/controllers");
    writeFile(repoRoot, "app/controllers/application_controller.rb", [
      "class ApplicationController < ActionController::API",
      "end",
      "",
    ].join("\n"), files);
  } else {
    // Standard Ruby project
    writeFile(repoRoot, `lib/${libName}.rb`, [
      `# frozen_string_literal: true`,
      "",
      `require_relative "${libName}/version"`,
      "",
      `module ${capitalize(libName)}`,
      "  def self.greet(name)",
      `    "Hello, #{name}! Welcome to ${answers.projectName}."`,
      "  end",
      "end",
      "",
    ].join("\n"), files);

    writeFile(repoRoot, `lib/${libName}/version.rb`, [
      `module ${capitalize(libName)}`,
      '  VERSION = "0.1.0"',
      "end",
      "",
    ].join("\n"), files);

    if (answers.framework === "sinatra") {
      writeFile(repoRoot, "app.rb", [
        'require "sinatra"',
        'require "json"',
        "",
        'get "/health" do',
        '  content_type :json',
        '  { status: "ok" }.to_json',
        "end",
        "",
      ].join("\n"), files);
    }
  }

  // Tests
  mkDir(repoRoot, "spec");
  writeFile(repoRoot, "spec/spec_helper.rb", [
    "RSpec.configure do |config|",
    "  config.expect_with :rspec do |expectations|",
    "    expectations.include_chain_clauses_in_custom_matcher_descriptions = true",
    "  end",
    "end",
    "",
  ].join("\n"), files);

  writeFile(repoRoot, `spec/${libName}_spec.rb`, [
    `require "spec_helper"`,
    "",
    `RSpec.describe "${answers.projectName}" do`,
    "  it \"works\" do",
    "    expect(true).to be true",
    "  end",
    "end",
    "",
  ].join("\n"), files);

  // Persistence
  if (answers.persistence === "sql" && answers.framework !== "rails") {
    mkDir(repoRoot, "db/migrate");
    writeFile(repoRoot, "db/migrate/.gitkeep", "", files);
  } else if (answers.persistence === "file-based") {
    mkDir(repoRoot, "data");
    writeFile(repoRoot, "data/.gitkeep", "", files);
  }
}

function capitalize(str: string): string {
  return str.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

// ---------------------------------------------------------------------------
// Main scaffold dispatcher
// ---------------------------------------------------------------------------

const SCAFFOLD_MAP: Record<OverlayName, (repoRoot: string, answers: ProjectWizardAnswers, files: string[]) => void> = {
  javascript: scaffoldJavaScript,
  python: scaffoldPython,
  go: scaffoldGo,
  rust: scaffoldRust,
  ruby: scaffoldRuby,
};

/**
 * Generate project files based on wizard answers.
 * Each language scaffold includes the detection trigger file
 * (package.json, pyproject.toml, go.mod, Cargo.toml, Gemfile)
 * so that inspectRepo() round-trips correctly.
 */
export function scaffoldProject(
  repoRoot: string,
  answers: ProjectWizardAnswers
): ScaffoldResult {
  const files: string[] = [];
  const scaffolder = SCAFFOLD_MAP[answers.language];
  scaffolder(repoRoot, answers, files);
  return { filesWritten: files };
}
