import { TechRegistry } from "@/lib/models";

export const techRegistry: TechRegistry = {
  version: "1.0.0",
  entries: [
    {
      key: "next.js",
      category: "frontend",
      alternatives: ["remix", "nuxt", "sveltekit"],
      compatibilityNotes: [
        "App Router route handlers map to Remix loaders/actions.",
        "Server component patterns need replacement when target framework lacks RSC."
      ],
      transformationHints: [
        "Rewrite file-system route docs to target framework conventions.",
        "Replace Next-specific runtime APIs with framework equivalents."
      ]
    },
    {
      key: "react",
      category: "frontend",
      alternatives: ["vue", "svelte", "solid"],
      compatibilityNotes: ["Component patterns differ by reactivity model."],
      transformationHints: ["Rewrite component contracts and state rules to target idioms."]
    },
    {
      key: "express",
      category: "backend",
      alternatives: ["fastify", "fastapi", "nestjs"],
      compatibilityNotes: ["Middleware pipeline ordering differs between frameworks."],
      transformationHints: [
        "Map Express middleware and router docs to target routing conventions.",
        "Translate request/response object expectations."
      ]
    },
    {
      key: "django",
      category: "backend",
      alternatives: ["fastapi", "flask"],
      compatibilityNotes: ["ORM and admin assumptions may not transfer 1:1."],
      transformationHints: ["Regenerate module and data access sections around target ORM/runtime."]
    },
    {
      key: "fastapi",
      category: "backend",
      alternatives: ["express", "django", "flask"],
      compatibilityNotes: ["Type-driven schema generation may need manual equivalents."],
      transformationHints: ["Convert pydantic/data validation assumptions to target stack patterns."]
    },
    {
      key: "mongodb",
      category: "db",
      alternatives: ["postgresql", "mysql", "dynamodb"],
      compatibilityNotes: ["Document schema-less to relational mapping explicitly."],
      transformationHints: [
        "Rewrite data model section with relational tables when switching to SQL.",
        "Add migration and indexing notes for new datastore."
      ]
    },
    {
      key: "postgresql",
      category: "db",
      alternatives: ["mongodb", "mysql", "cockroachdb"],
      compatibilityNotes: ["Transactional behavior and query model differ from document stores."],
      transformationHints: ["Adjust data contracts and constraints around SQL semantics."]
    },
    {
      key: "firebase",
      category: "auth",
      alternatives: ["auth0", "clerk", "supabase-auth"],
      compatibilityNotes: ["Token claim and provider management models vary."],
      transformationHints: ["Rewrite auth integration interface and user lifecycle rules."]
    },
    {
      key: "aws-lambda",
      category: "infra",
      alternatives: ["vercel-functions", "cloud-run", "kubernetes"],
      compatibilityNotes: ["Cold starts and runtime limits differ."],
      transformationHints: ["Update deployment constraints and scaling assumptions in plan."]
    }
  ]
};
