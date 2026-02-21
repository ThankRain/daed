# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**daed** is a modern web dashboard for [dae](https://github.com/daeuniverse/dae), a Linux high-performance transparent proxy solution. This is a monorepo containing:

- **Frontend**: React + TypeScript + Vite web dashboard (`apps/web/`)
- **Backend**: Go GraphQL API server (`wing/`) - now vendored as regular directory
- **Core**: eBPF-based proxy engine (`wing/dae-core/`) - embedded submodule

## Architecture

### Frontend-Backend Communication

The frontend communicates with the backend via **GraphQL** over HTTP:

- Frontend uses `@tanstack/react-query` for data fetching and caching
- GraphQL schema types are auto-generated via `pnpm codegen`
- API layer is in `apps/web/src/apis/` (queries in `query.ts`, mutations in `mutation.ts`)
- GraphQL endpoint is served by the Go backend at `/graphql`

### Backend (dae-wing)

Go-based GraphQL server that wraps dae-core:

- **GraphQL Layer**: `wing/graphql/` - schema definitions and resolvers
- **Service Layer**: `wing/graphql/service/*/` - business logic for each domain (config, dns, group, node, routing, subscription, user)
- **dae Integration**: `wing/dae/` - interfaces with dae-core for actual proxy functionality
- **Web Rendering**: `wing/webrender/` - embeds frontend static files into Go binary

### Core (dae-core)

eBPF-based transparent proxy engine:

- **Control Plane**: `wing/dae-core/control/` - eBPF program loading and network redirection
- **Config Parser**: `wing/dae-core/config/` - dae configuration parsing
- **Components**: `wing/dae-core/component/` - DNS, outbound dialers, routing, sniffing

## Common Commands

### Frontend Development

```bash
# Install dependencies (uses pnpm 10.24.0)
pnpm install

# Start development server (runs on http://localhost:5173)
pnpm dev

# Start with mock backend
pnpm dev:mock

# Build for production
pnpm build

# Build with mock mode
pnpm build:mock

# Run linter (ESLint with @antfu/eslint-config)
pnpm lint

# Generate GraphQL types from schema
pnpm codegen

# Run tests
pnpm test

# Type check
pnpm check-types
```

### Full Build (Frontend + Backend)

```bash
# Build everything (requires Go, clang, kernel headers for eBPF)
make

# Clean build artifacts
make clean

# Skip submodule initialization (if wing/ is already populated)
make SKIP_SUBMODULES=1
```

### Backend-only Development

```bash
cd wing/

# Build dae-wing binary
make

# Build with specific output
make OUTPUT=./dae-wing

# Generate GraphQL resolvers
make schema-resolver

# Format Go code
make fmt

# Build complete bundle with embedded web assets
make bundle WEB_DIST=../dist
```

## Development Workflow

### Frontend Changes

1. The frontend is in `apps/web/src/`
2. Uses React 19 + React Router 7 + Tailwind CSS 4
3. UI components are based on Radix UI + shadcn/ui pattern in `components/ui/`
4. State management uses nanostores for global state, React Query for server state
5. Run `pnpm dev` for live reload development

### GraphQL Schema Changes

If you modify the backend GraphQL schema:

1. Backend schemas are in `wing/graphql/service/*/schema.go`
2. After backend changes, regenerate frontend types:
   ```bash
   pnpm codegen
   ```
3. The generated types go to `apps/web/src/schemas/gql/`

### Adding Protocol Support

To add a new proxy protocol:

1. Add protocol form in `apps/web/src/components/ConfigureNodeFormModal/`
2. Update protocol registry in `protocols/` directory
3. Backend protocol support is in dae-core (Go)

## Testing

```bash
# Run all tests
pnpm test

# Run single test file
pnpm vitest run src/utils/index.test.ts

# Run tests in UI mode
pnpm vitest --ui
```

## Key File Locations

| Purpose | Location |
|---------|----------|
| Frontend Entry | `apps/web/src/main.tsx` |
| Frontend Routes | `apps/web/src/Router.tsx` |
| GraphQL Queries | `apps/web/src/apis/query.ts` |
| GraphQL Mutations | `apps/web/src/apis/mutation.ts` |
| GraphQL Schema | `wing/graphql/service/*/schema.go` |
| dae Config | `wing/dae-core/config/` |
| eBPF Code | `wing/dae-core/control/kern/` |

## Commit Guidelines

Uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Scopes: `ui`, `api`, `config`, `deps`, etc.

## License Notes

- Frontend (daed): MIT License
- Backend (dae-wing): AGPL-3.0 License
