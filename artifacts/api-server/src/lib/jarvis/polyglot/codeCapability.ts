export interface LanguageCapabilityProfile {
  languageId: string;
  name: string;
  fileExtensions: string[];
  primaryFrameworks: string[];
  packageManagers: string[];
  testRunners: string[];
  linters: string[];
  typeSystem: "STATIC_STRONG" | "STATIC_GRADUAL" | "DYNAMIC_STRONG" | "DYNAMIC_WEAK";
  concurrencyModel: "EVENT_LOOP" | "THREADS" | "GOROUTINES" | "ACTORS" | "ASYNC_AWAIT";
  recommendedProjectStructure: string[];
}

export class CodeCapabilityManager {
  private profiles: Map<string, LanguageCapabilityProfile> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public getProfile(languageId: string): LanguageCapabilityProfile | undefined {
    return this.profiles.get(languageId.toLowerCase());
  }

  public getAllProfiles(): LanguageCapabilityProfile[] {
    return Array.from(this.profiles.values());
  }

  private registerDefaults(): void {
    const profiles: LanguageCapabilityProfile[] = [
      {
        languageId: "typescript",
        name: "TypeScript",
        fileExtensions: [".ts", ".tsx"],
        primaryFrameworks: ["React", "Express", "Next.js", "Hono"],
        packageManagers: ["npm", "pnpm", "yarn"],
        testRunners: ["vitest", "jest"],
        linters: ["eslint", "tsc"],
        typeSystem: "STATIC_GRADUAL",
        concurrencyModel: "EVENT_LOOP",
        recommendedProjectStructure: [
          "src/components/",
          "src/lib/",
          "src/api/",
          "src/types/",
          "tests/",
        ],
      },
      {
        languageId: "python",
        name: "Python",
        fileExtensions: [".py"],
        primaryFrameworks: ["FastAPI", "Flask", "PyTorch", "NumPy"],
        packageManagers: ["pip", "poetry", "uv"],
        testRunners: ["pytest", "unittest"],
        linters: ["flake8", "black", "ruff", "mypy"],
        typeSystem: "DYNAMIC_STRONG",
        concurrencyModel: "ASYNC_AWAIT",
        recommendedProjectStructure: [
          "app/",
          "core/",
          "services/",
          "models/",
          "tests/",
        ],
      },
      {
        languageId: "rust",
        name: "Rust",
        fileExtensions: [".rs"],
        primaryFrameworks: ["Actix-web", "Axum", "Tokio", "Serde"],
        packageManagers: ["cargo"],
        testRunners: ["cargo test"],
        linters: ["clippy"],
        typeSystem: "STATIC_STRONG",
        concurrencyModel: "ASYNC_AWAIT",
        recommendedProjectStructure: [
          "src/main.rs",
          "src/lib.rs",
          "src/modules/",
          "tests/",
        ],
      },
      {
        languageId: "go",
        name: "Go",
        fileExtensions: [".go"],
        primaryFrameworks: ["Gin", "Fiber", "Chi"],
        packageManagers: ["go modules"],
        testRunners: ["go test"],
        linters: ["golangci-lint"],
        typeSystem: "STATIC_STRONG",
        concurrencyModel: "GOROUTINES",
        recommendedProjectStructure: [
          "cmd/app/",
          "internal/pkg/",
          "api/",
          "configs/",
        ],
      },
    ];

    for (const p of profiles) {
      this.profiles.set(p.languageId.toLowerCase(), p);
    }
  }
}
