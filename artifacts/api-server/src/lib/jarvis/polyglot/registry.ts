import { TechnologyRecord } from "./types";

export class TechnologyCapabilityRegistry {
  private records: Map<string, TechnologyRecord> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public register(record: TechnologyRecord): void {
    this.records.set(record.technologyId.toLowerCase(), record);
  }

  public get(technologyId: string): TechnologyRecord | undefined {
    return this.records.get(technologyId.toLowerCase());
  }

  public getAll(): TechnologyRecord[] {
    return Array.from(this.records.values());
  }

  public getByCategory(category: string): TechnologyRecord[] {
    return this.getAll().filter((r) => r.category === category);
  }

  public findByCapability(capability: string): TechnologyRecord[] {
    const term = capability.toLowerCase();
    return this.getAll().filter((r) =>
      r.capabilities.some((cap) => cap.toLowerCase().includes(term))
    );
  }

  private registerDefaults(): void {
    const defaults: TechnologyRecord[] = [
      // --- PROGRAMMING LANGUAGES ---
      {
        technologyId: "lang_typescript",
        name: "TypeScript",
        category: "LANGUAGE",
        capabilities: ["type_safety", "async_await", "fullstack", "frontend_ui", "backend_orchestration", "json_schema"],
        strengths: ["Strong static typing", "Massive web ecosystem", "Fast iteration", "Isomorphic code sharing"],
        weaknesses: ["Runtime type erasure", "Not suited for hard real-time hardware control"],
        supportedWorkloads: ["Orchestration planes", "Web UI", "REST/GraphQL APIs", "Microservices"],
        runtimeRequirements: ["Node.js", "Bun", "Deno", "Browser"],
        performanceCharacteristics: { latency: "LOW", throughput: "HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Containerized", "Serverless", "Edge runtime"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["npm supply chain audits", "strict compiler flags"],
        interoperability: ["JavaScript", "Python via RPC/HTTP", "C/Rust via N-API"],
        alternatives: ["JavaScript", "Go", "Python"],
        confidence: 0.98,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Jarvis Core Architecture Standard",
      },
      {
        technologyId: "lang_python",
        name: "Python",
        category: "LANGUAGE",
        capabilities: ["data_science", "machine_learning", "embeddings", "semantic_retrieval", "vector_math", "probabilistic_modeling"],
        strengths: ["Dominant AI/ML ecosystem", "Rich numerical libraries (NumPy, PyTorch)", "Fast prototyping"],
        weaknesses: ["GIL execution bottleneck for pure multithreaded CPU loops", "Higher memory usage"],
        supportedWorkloads: ["AI Intelligence services", "Vector embeddings", "RAG pipelines", "Statistical analysis"],
        runtimeRequirements: ["Python 3.10+"],
        performanceCharacteristics: { latency: "MEDIUM", throughput: "MEDIUM", memoryFootprint: "HEAVY" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Docker container", "Microservice", "Serverless WSGI/ASGI"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["PyPI package vetting", "Virtualenv isolation"],
        interoperability: ["TypeScript via HTTP/CLI", "C/C++ extensions", "Rust via PyO3"],
        alternatives: ["Julia", "R", "C++"],
        confidence: 0.98,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Jarvis Intelligence Layer Contract",
      },
      {
        technologyId: "lang_rust",
        name: "Rust",
        category: "LANGUAGE",
        capabilities: ["high_performance", "memory_safety", "system_programming", "zero_cost_abstractions", "concurrency"],
        strengths: ["No garbage collector", "Guaranteed memory safety", "Extremely low latency and throughput"],
        weaknesses: ["Steep learning curve", "Longer compilation times"],
        supportedWorkloads: ["High-throughput parsers", "Real-time audio/video", "Cryptography", "Vector index engines"],
        runtimeRequirements: ["Native binary"],
        performanceCharacteristics: { latency: "EXTREMELY_LOW", throughput: "EXTREMELY_HIGH", memoryFootprint: "MINIMAL" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Static single binary", "Container", "WASM"],
        ecosystemMaturity: "MATURE",
        securityConsiderations: ["Borrow checker prevents memory bugs", "Cargo audit"],
        interoperability: ["C ABI", "Node.js N-API", "Python PyO3"],
        alternatives: ["C++", "Go"],
        confidence: 0.95,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Systems Benchmarks 2025",
      },
      {
        technologyId: "lang_go",
        name: "Go",
        category: "LANGUAGE",
        capabilities: ["concurrency", "goroutines", "microservices", "networking", "fast_compilation"],
        strengths: ["Built-in lightweight concurrency", "Fast compile times", "Small memory footprint"],
        weaknesses: ["Simpler type system compared to Rust/Haskell", "Garbage collection pauses"],
        supportedWorkloads: ["Networking proxies", "Microservices", "DevOps tools", "High-concurrency servers"],
        runtimeRequirements: ["Native binary"],
        performanceCharacteristics: { latency: "LOW", throughput: "EXTREMELY_HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Static binary", "Container"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["Memory safe runtime", "go vet static analysis"],
        interoperability: ["Cgo", "gRPC", "HTTP"],
        alternatives: ["Java", "Rust", "TypeScript"],
        confidence: 0.96,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Cloud Native Computing Foundation Standards",
      },

      // --- DATA SYSTEMS ---
      {
        technologyId: "data_postgresql",
        name: "PostgreSQL",
        category: "DATA_SYSTEM",
        capabilities: ["transactional_state", "acid_compliance", "relational_schema", "jsonb", "pgvector_search"],
        strengths: ["ACID compliant", "Extensible with pgvector", "Rich indexing (B-tree, GIN, GiST)"],
        weaknesses: ["Vertical scaling limit for write operations"],
        supportedWorkloads: ["Transactional state", "Structured persistence", "Vector search via pgvector"],
        runtimeRequirements: ["Postgres 14+"],
        performanceCharacteristics: { latency: "LOW", throughput: "HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Managed Cloud SQL", "PGlite in-memory", "Container"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["Role-based access control", "TLS encryption at rest/transit"],
        interoperability: ["SQL", "Drizzle ORM", "Prisma"],
        alternatives: ["MySQL", "SQLite", "CockroachDB"],
        confidence: 0.98,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Drizzle ORM & Cloud SQL Integration Standard",
      },
      {
        technologyId: "data_redis",
        name: "Redis",
        category: "DATA_SYSTEM",
        capabilities: ["in_memory_cache", "pub_sub", "fast_kv", "rate_limiting", "session_store"],
        strengths: ["Sub-millisecond latency", "Atomic data structure operations"],
        weaknesses: ["Volatile memory storage if unpersisted"],
        supportedWorkloads: ["Caching", "Session management", "Real-time pub/sub messaging"],
        runtimeRequirements: ["Redis server"],
        performanceCharacteristics: { latency: "EXTREMELY_LOW", throughput: "EXTREMELY_HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Container", "Managed Redis"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["Password auth", "VPC isolation"],
        interoperability: ["RESP protocol", "ioredisc"],
        alternatives: ["Memcached", "KeyDB"],
        confidence: 0.95,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Caching Architecture Benchmarks",
      },

      // --- AI / ML INTELLIGENCE DOMAIN ---
      {
        technologyId: "ai_python_rag",
        name: "Python Intelligence RAG Engine",
        category: "AI_ML",
        capabilities: ["embeddings", "semantic_retrieval", "reranking", "claim_evaluation", "probabilistic_calibration"],
        strengths: ["Multi-factor reranking", "Project isolation", "Deterministic development fallback"],
        weaknesses: ["Requires IPC/HTTP bridge from Node.js"],
        supportedWorkloads: ["Memory retrieval", "Context synthesis", "Cognitive model scoring"],
        runtimeRequirements: ["Python 3.10+"],
        performanceCharacteristics: { latency: "LOW", throughput: "HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Subprocess CLI / HTTP Server on port 5050"],
        ecosystemMaturity: "MATURE",
        securityConsiderations: ["Process isolation", "Sanitized request contracts"],
        interoperability: ["TypeScript via PythonIntelligenceClient"],
        alternatives: ["LangChain", "LlamaIndex"],
        confidence: 0.98,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Jarvis Batch 3.5 Intelligence Spec",
      },

      // --- FRONTEND / APPLICATION ---
      {
        technologyId: "front_react",
        name: "React & Web Platform",
        category: "FRONTEND",
        capabilities: ["single_page_app", "component_architecture", "reactive_state", "tailwind_styling"],
        strengths: ["Massive component library", "Declarative UI rendering", "Fast developer velocity"],
        weaknesses: ["DOM rendering overhead for extreme 60fps canvas graphics"],
        supportedWorkloads: ["Desktop & mobile responsive UI dashboards", "Web applications"],
        runtimeRequirements: ["Browser runtime", "Vite / Webpack"],
        performanceCharacteristics: { latency: "LOW", throughput: "HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Static bundle", "CDN distribution"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["XSS mitigation via JSX escaping", "CSP headers"],
        interoperability: ["REST APIs", "WebSockets"],
        alternatives: ["Vue", "Svelte"],
        confidence: 0.98,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "AI Studio Client Framework Standard",
      },

      // --- DEVOPS / INFRASTRUCTURE ---
      {
        technologyId: "infra_docker",
        name: "Docker & Containerization",
        category: "DEVOPS_INFRA",
        capabilities: ["containerization", "reproducible_environments", "microservice_isolation", "cloud_run_deployment"],
        strengths: ["Environment consistency", "Lightweight isolation"],
        weaknesses: ["Slight runtime virtualization overhead"],
        supportedWorkloads: ["Full-stack app deployment", "Cloud Run services"],
        runtimeRequirements: ["Docker Engine / Containerd"],
        performanceCharacteristics: { latency: "LOW", throughput: "HIGH", memoryFootprint: "MODERATE" },
        localOfflineCapability: true,
        deploymentCharacteristics: ["Cloud Run", "Kubernetes", "Docker Compose"],
        ecosystemMaturity: "ENTERPRISE_STANDARD",
        securityConsiderations: ["Non-root user execution", "Image vulnerability scanning"],
        interoperability: ["OCI image standard"],
        alternatives: ["Podman", "Containerd"],
        confidence: 0.98,
        lastVerified: new Date().toISOString(),
        status: "VERIFIED",
        evidenceSource: "Cloud Run Production Deployment Standard",
      },
    ];

    for (const record of defaults) {
      this.register(record);
    }
  }
}
